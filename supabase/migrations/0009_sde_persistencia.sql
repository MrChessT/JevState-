-- 0009 · Persistencia del pipeline SDE y cola de trabajos accesible por la API (solo service_role).
--
-- sde_guardar() escribe en UNA transacción todo lo que produce el enriquecimiento de un inmueble:
-- ficha, datos privados, evidencias, campos canónicos (sin tocar las correcciones manuales),
-- cola de revisión, decisiones de Jev, traducciones, medios y distancias a POI.

create or replace function public.sde_contexto(p_agency uuid, p_source text, p_source_id text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'listing_id', l.id,
    'content_hash', l.content_hash,
    'manuales', coalesce((
      select jsonb_object_agg(f.field_id, jsonb_build_object(
        'value', f.value, 'confidence', f.confidence, 'status', f.status, 'method', f.method,
        'evidenceIds', to_jsonb(f.evidence_ids), 'catalogVersion', f.catalog_version))
      from public.listing_fields f where f.listing_id = l.id and f.method = 'manual'), '{}'::jsonb)
  )
  from public.listings l
  where l.agency_id = p_agency and l.source = p_source and l.source_id = p_source_id
$$;

create or replace function public.sde_guardar(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_agency uuid := (p ->> 'agency_id')::uuid;
  v_l jsonb := p -> 'listing';
  v_id uuid;
  v_prev jsonb;
  v_version int;
  v_cambio boolean;
  v_zone uuid;
begin
  select id into v_zone from public.zones where path = v_l ->> 'zone_path';

  select id, canonical, canonical_version into v_id, v_prev, v_version
  from public.listings
  where agency_id = v_agency and source = v_l ->> 'source' and source_id = v_l ->> 'source_id'
  for update;

  v_cambio := v_prev is null or v_prev is distinct from (v_l -> 'canonical');

  if v_id is null then
    insert into public.listings (agency_id, ref, slug, status, operation, zone_id, location_public, canonical, canonical_version,
      catalog_version, price, currency, area_m2, bedrooms, bathrooms, property_type, source, source_id, content_hash, is_fictitious)
    values (v_agency, v_l ->> 'ref', v_l ->> 'slug', coalesce((v_l ->> 'status')::public.estado_inmueble, 'borrador'),
      (v_l ->> 'operation')::public.operacion_inmueble, v_zone,
      case when v_l ? 'lat' then extensions.st_setsrid(extensions.st_makepoint((v_l ->> 'lon')::float8, (v_l ->> 'lat')::float8), 4326)::extensions.geography end,
      v_l -> 'canonical', 1, v_l ->> 'catalog_version', (v_l ->> 'price')::numeric, coalesce(v_l ->> 'currency', 'EUR'),
      (v_l ->> 'area_m2')::numeric, (v_l ->> 'bedrooms')::smallint, (v_l ->> 'bathrooms')::smallint, v_l ->> 'property_type',
      v_l ->> 'source', v_l ->> 'source_id', v_l ->> 'content_hash', coalesce((v_l ->> 'is_fictitious')::boolean, false))
    returning id, canonical_version into v_id, v_version;
  else
    -- El estado lo gestiona el equipo: el pipeline no lo cambia en inmuebles existentes.
    update public.listings set
      slug = v_l ->> 'slug', operation = (v_l ->> 'operation')::public.operacion_inmueble, zone_id = v_zone,
      location_public = case when v_l ? 'lat' then extensions.st_setsrid(extensions.st_makepoint((v_l ->> 'lon')::float8, (v_l ->> 'lat')::float8), 4326)::extensions.geography else location_public end,
      canonical = v_l -> 'canonical',
      canonical_version = canonical_version + case when v_cambio then 1 else 0 end,
      catalog_version = v_l ->> 'catalog_version', price = (v_l ->> 'price')::numeric, area_m2 = (v_l ->> 'area_m2')::numeric,
      bedrooms = (v_l ->> 'bedrooms')::smallint, bathrooms = (v_l ->> 'bathrooms')::smallint, property_type = v_l ->> 'property_type',
      content_hash = v_l ->> 'content_hash'
    where id = v_id
    returning canonical_version into v_version;
  end if;

  if p ? 'private' then
    insert into public.listing_private (listing_id, agency_id, address_exact, location_exact, cadastral_ref)
    values (v_id, v_agency, p -> 'private' ->> 'address_exact',
      case when (p -> 'private') ? 'lat' then extensions.st_setsrid(extensions.st_makepoint((p -> 'private' ->> 'lon')::float8, (p -> 'private' ->> 'lat')::float8), 4326)::extensions.geography end,
      p -> 'private' ->> 'cadastral_ref')
    on conflict (listing_id) do update set
      address_exact = coalesce(excluded.address_exact, public.listing_private.address_exact),
      location_exact = coalesce(excluded.location_exact, public.listing_private.location_exact),
      cadastral_ref = coalesce(excluded.cadastral_ref, public.listing_private.cadastral_ref);
  end if;

  insert into public.listing_evidence (id, listing_id, agency_id, source, path, raw, parsed, source_weight, captured_at, content_hash)
  select (e ->> 'id')::uuid, v_id, v_agency, (e ->> 'source')::public.fuente_evidencia, e ->> 'path', e ->> 'raw', e -> 'parsed',
    (e ->> 'sourceWeight')::numeric, (e ->> 'capturedAt')::timestamptz, md5(e ->> 'raw')
  from jsonb_array_elements(coalesce(p -> 'evidence', '[]'::jsonb)) e
  on conflict do nothing;

  -- Campos: las correcciones manuales nunca se sobrescriben (se saltan, sin error).
  insert into public.listing_fields (listing_id, agency_id, field_id, value, confidence, status, method, evidence_ids, catalog_version, is_public, adjudication)
  select v_id, v_agency, f ->> 'field_id', f -> 'value', (f ->> 'confidence')::numeric, (f ->> 'status')::public.estado_campo,
    (f ->> 'method')::public.metodo_campo,
    array(select jsonb_array_elements_text(coalesce(f -> 'evidence_ids', '[]'::jsonb)))::uuid[],
    f ->> 'catalog_version', coalesce((f ->> 'is_public')::boolean, false), f -> 'adjudication'
  from jsonb_array_elements(coalesce(p -> 'fields', '[]'::jsonb)) f
  where f ->> 'method' <> 'manual'
  on conflict (listing_id, field_id) do update set
    value = excluded.value, confidence = excluded.confidence, status = excluded.status, method = excluded.method,
    evidence_ids = excluded.evidence_ids, catalog_version = excluded.catalog_version, is_public = excluded.is_public,
    adjudication = excluded.adjudication
  where public.listing_fields.method <> 'manual';

  insert into public.review_queue (agency_id, listing_id, field_id, reason, proposed, confidence, evidence_ids, catalog_version)
  select v_agency, v_id, r ->> 'field_id', (r ->> 'reason')::public.motivo_revision, r -> 'proposed', (r ->> 'confidence')::numeric,
    array(select jsonb_array_elements_text(coalesce(r -> 'evidence_ids', '[]'::jsonb)))::uuid[], r ->> 'catalog_version'
  from jsonb_array_elements(coalesce(p -> 'reviews', '[]'::jsonb)) r
  where not exists (select 1 from public.listing_fields lf where lf.listing_id = v_id and lf.field_id = r ->> 'field_id' and lf.method = 'manual')
  on conflict (listing_id, field_id, reason) where status = 'pendiente' do update set
    proposed = excluded.proposed, confidence = excluded.confidence, evidence_ids = excluded.evidence_ids, catalog_version = excluded.catalog_version;

  insert into public.jev_decisions (agency_id, purpose, listing_id, question_id, question_type, instructions, options, answer, chosen, gate_key, gate, outcome, catalog_version, model, cached, created_at)
  select v_agency, d ->> 'purpose', v_id, d ->> 'questionId', d ->> 'questionType', d -> 'instructions', d -> 'options', d -> 'answer', d -> 'chosen',
    d ->> 'gateKey', d -> 'gate', (d ->> 'outcome')::public.resultado_puerta, d ->> 'catalogVersion', d ->> 'model', coalesce((d ->> 'cached')::boolean, false),
    coalesce((d ->> 'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(p -> 'decisions', '[]'::jsonb)) d;

  insert into public.listing_translations (listing_id, agency_id, locale, title, description, machine_translated)
  select v_id, v_agency, t ->> 'locale', t ->> 'title', coalesce(t ->> 'description', ''), coalesce((t ->> 'machine_translated')::boolean, false)
  from jsonb_array_elements(coalesce(p -> 'translations', '[]'::jsonb)) t
  on conflict (listing_id, locale) do update set title = excluded.title, description = excluded.description, machine_translated = excluded.machine_translated, updated_at = now();

  if p ? 'media' then
    delete from public.listing_media where listing_id = v_id and storage_path is null;
    insert into public.listing_media (listing_id, agency_id, kind, url, position, is_cover)
    select v_id, v_agency, 'foto', m ->> 'url', (m ->> 'position')::int, (m ->> 'position')::int = 0
    from jsonb_array_elements(p -> 'media') m;
  end if;

  if p ? 'poi_distances' then
    delete from public.listing_poi_distances where listing_id = v_id;
    insert into public.listing_poi_distances (listing_id, poi_id, category, distance_m, walk_min)
    select v_id, (d ->> 'poi_id')::uuid, (d ->> 'category')::public.categoria_poi, (d ->> 'distance_m')::int, (d ->> 'walk_min')::int
    from jsonb_array_elements(p -> 'poi_distances') d
    where exists (select 1 from public.pois where id = (d ->> 'poi_id')::uuid);
  end if;

  return jsonb_build_object('listing_id', v_id, 'canonical_version', v_version, 'cambio', v_cambio);
end $$;

-- Cola de trabajos por la API: envoltorios de app.* solo para service_role.
create or replace function public.trabajos_encolar(p_kind text, p_payload jsonb, p_dedupe text default null, p_agency uuid default null, p_max_attempts int default 5)
returns bigint
language sql security definer
set search_path = ''
as $$
  insert into public.jobs (agency_id, kind, payload, dedupe_key, max_attempts)
  values (p_agency, p_kind, p_payload, p_dedupe, p_max_attempts)
  on conflict (dedupe_key) do nothing
  returning id
$$;

create or replace function public.trabajos_reservar(p_kind text, p_n int, p_worker text)
returns setof public.jobs
language sql security definer
set search_path = ''
as $$ select * from app.reservar_trabajos(p_kind, p_n, p_worker) $$;

create or replace function public.trabajos_terminar(p_id bigint, p_error text default null)
returns void
language sql security definer
set search_path = ''
as $$ select app.terminar_trabajo(p_id, p_error) $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sde_contexto(uuid, text, text)', 'public.sde_guardar(jsonb)',
    'public.trabajos_encolar(text, jsonb, text, uuid, int)', 'public.trabajos_reservar(text, int, text)', 'public.trabajos_terminar(bigint, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
