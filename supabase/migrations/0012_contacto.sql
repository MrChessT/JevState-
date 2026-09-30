-- 0012 · Conversión: registrar una petición de contacto o de visita desde la web o el asistente.
-- Una sola función, invocable SOLO desde el servidor (service_role): valida, guarda el
-- consentimiento RGPD, crea el lead y, si se pidió visita con fecha, la visita «solicitada».
-- Todo en una transacción: o se guarda completo o no se guarda nada.

create or replace function public.registrar_contacto(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
  v_agency uuid;
  v_consent uuid;
  v_lead uuid;
  v_tipo text := coalesce(p ->> 'tipo', 'contacto');
  v_email text := nullif(lower(trim(p ->> 'email')), '');
  v_telefono text := nullif(trim(p ->> 'telefono'), '');
  v_fecha date := nullif(p ->> 'fecha', '')::date;
  v_franja text := coalesce(p ->> 'franja', 'indiferente');
  v_inicio timestamptz;
begin
  if v_tipo not in ('contacto', 'visita', 'pregunta_no_consta') then
    raise exception 'tipo no válido: %', v_tipo using errcode = '22023';
  end if;
  if v_email is null and v_telefono is null then
    raise exception 'hace falta un email o un teléfono' using errcode = '22023';
  end if;
  if coalesce((p ->> 'consentimiento')::boolean, false) is not true then
    raise exception 'sin consentimiento no se guardan datos de contacto' using errcode = '22023';
  end if;
  if coalesce(p ->> 'sujeto_hash', '') = '' then
    raise exception 'falta sujeto_hash' using errcode = '22023';
  end if;

  if p ? 'ref' and p ->> 'ref' <> '' then
    select l.* into v_listing from public.listings l
    where l.ref = p ->> 'ref' and l.status in ('publicado', 'reservado')
    limit 1;
    if v_listing.id is null then
      raise exception 'inmueble no disponible: %', p ->> 'ref' using errcode = '22023';
    end if;
    v_agency := v_listing.agency_id;
  else
    select a.id into v_agency from public.agencies a order by a.created_at limit 1;
  end if;
  if v_agency is null then
    raise exception 'no hay agencia configurada' using errcode = '22023';
  end if;

  insert into public.consents (agency_id, subject_hash, purpose, legal_basis, granted, text_version, locale, ip_hash)
  values (v_agency, p ->> 'sujeto_hash', case when v_tipo = 'visita' then 'visita' else 'contacto' end, 'consentimiento', true,
          coalesce(p ->> 'texto_version', 'v1'), coalesce(p ->> 'locale', 'es'), nullif(p ->> 'ip_hash', ''))
  returning id into v_consent;

  insert into public.leads (agency_id, listing_id, agent_id, consent_id, origin, kind, name, email, phone, message, asked_field, search_criteria, conversation_summary)
  values (v_agency, v_listing.id, v_listing.agent_id, v_consent,
          case when p ->> 'origen' = 'asistente' then 'asistente' else 'formulario' end,
          v_tipo, nullif(trim(p ->> 'nombre'), ''), v_email, v_telefono, nullif(trim(p ->> 'mensaje'), ''),
          nullif(p ->> 'campo', ''),
          case when p ? 'busqueda' then p -> 'busqueda' else null end,
          nullif(p ->> 'resumen', ''))
  returning id into v_lead;

  -- Visita con fecha: franja orientativa (mañana 10-13 h, tarde 17-20 h). El agente la confirma.
  if v_tipo = 'visita' and v_fecha is not null and v_listing.id is not null then
    v_inicio := (v_fecha + case when v_franja = 'tarde' then time '17:00' else time '10:00' end) at time zone 'Europe/Madrid';
    insert into public.visits (agency_id, lead_id, listing_id, agent_id, starts_at, ends_at, status, notes)
    values (v_agency, v_lead, v_listing.id, v_listing.agent_id, v_inicio, v_inicio + interval '3 hours', 'solicitada',
            'Franja preferida: ' || v_franja);
  end if;

  return v_lead;
end;
$$;

revoke all on function public.registrar_contacto(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_contacto(jsonb) to service_role;

-- Bandeja del CRM: leads con su inmueble y su visita, para admin y agentes (RLS de leads).
create or replace view public.crm_bandeja
with (security_invoker = true) as
select
  ld.id, ld.agency_id, ld.created_at, ld.updated_at, ld.status, ld.kind, ld.origin,
  ld.name, ld.email, ld.phone, ld.message, ld.asked_field,
  l.ref as listing_ref, l.slug as listing_slug, l.operation as listing_operation, z.path as listing_zona_path,
  v.starts_at as visita_inicio, v.status as visita_estado
from public.leads ld
left join public.listings l on l.id = ld.listing_id
left join public.zones z on z.id = l.zone_id
left join lateral (
  select vi.starts_at, vi.status from public.visits vi where vi.lead_id = ld.id order by vi.created_at desc limit 1
) v on true;

grant select on public.crm_bandeja to authenticated;
