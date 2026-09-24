-- 0010 · Lectura del portal: búsqueda con filtros, facetas y ficha. SECURITY INVOKER: RLS decide
-- qué ve cada cual (el portal solo ve publicados/reservados y campos públicos).

create index if not exists listing_fields_rasgo_idx on public.listing_fields(field_id, listing_id) where status in ('confirmado', 'probable');

-- Posición de la planta en el resumen (el asistente permite «sin bajos»).
create or replace function public.inmueble_planta(l public.listings) returns text
language sql stable
set search_path = ''
as $$ select f.value #>> '{}' from public.listing_fields f where f.listing_id = l.id and f.field_id = 'planta_tipo' and f.status in ('confirmado', 'probable') $$;
grant execute on function public.inmueble_planta(public.listings) to anon, authenticated, service_role;

-- Resumen de un inmueble para tarjetas y mapa.
create or replace function public.inmueble_resumen(l public.listings)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'ref', l.ref, 'slug', l.slug, 'operacion', l.operation, 'tipo', l.property_type,
    'titulo', coalesce((select t.title from public.listing_translations t where t.listing_id = l.id and t.locale = 'es'), l.ref),
    'zonaPath', z.path, 'zonaNombre', z.name, 'municipioNombre', coalesce(m.name, z.name),
    'precio', l.price, 'precioAnterior', (select (f.value #>> '{}')::numeric from public.listing_fields f where f.listing_id = l.id and f.field_id = 'precio_anterior' and f.value is not null),
    'superficie', l.area_m2, 'habitaciones', l.bedrooms, 'banos', l.bathrooms, 'plantaTipo', public.inmueble_planta(l),
    'lat', extensions.st_y(l.location_public::extensions.geometry), 'lon', extensions.st_x(l.location_public::extensions.geometry),
    'foto', (select coalesce(md.url, md.storage_path) from public.listing_media md where md.listing_id = l.id order by md.is_cover desc, md.position limit 1),
    'rasgos', coalesce((select jsonb_agg(jsonb_build_object('campo', f.field_id, 'status', f.status))
                        from public.listing_fields f
                        where f.listing_id = l.id and f.is_public and f.status in ('confirmado', 'probable')
                          and f.field_id in ('terraza', 'ascensor', 'garaje', 'piscina', 'trastero', 'aire_acondicionado', 'exterior', 'amueblado', 'vistas')
                          and (f.value = 'true'::jsonb or (jsonb_typeof(f.value) = 'string' and f.value <> '"no_tiene"'::jsonb))), '[]'::jsonb),
    'publicadoEn', coalesce(l.published_at, l.created_at), 'ficticio', l.is_fictitious)
  from public.zones z left join public.zones m on m.id = z.parent_id
  where z.id = l.zone_id
$$;

create or replace function public.buscar_inmuebles(f jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_zona text := f ->> 'zona';
  v_pagina int := greatest(1, coalesce((f ->> 'pagina')::int, 1));
  v_por int := least(48, greatest(1, coalesce((f ->> 'porPagina')::int, 12)));
  v_con text[] := array(select jsonb_array_elements_text(coalesce(f -> 'con', '[]'::jsonb)));
  v_tipos text[] := array(select jsonb_array_elements_text(coalesce(f -> 'tipos', '[]'::jsonb)));
  resultado jsonb;
begin
  with base as (
    select l.* from public.listings l
    left join public.zones z on z.id = l.zone_id
    where l.status in ('publicado', 'reservado')
      and (l.operation::text = f ->> 'operacion' or (f ->> 'operacion' = 'alquiler' and l.operation = 'alquiler_vacacional' and false))
      and (v_zona is null or z.path = v_zona or z.path like v_zona || '/%')
      and ((f ->> 'precioMin') is null or l.price >= (f ->> 'precioMin')::numeric)
      and ((f ->> 'precioMax') is null or l.price <= (f ->> 'precioMax')::numeric)
      and ((f ->> 'habMin') is null or coalesce(l.bedrooms, 0) >= (f ->> 'habMin')::int)
      and ((f ->> 'banosMin') is null or coalesce(l.bathrooms, 0) >= (f ->> 'banosMin')::int)
      and ((f ->> 'm2Min') is null or coalesce(l.area_m2, 0) >= (f ->> 'm2Min')::numeric)
      and not exists (
        select 1 from unnest(v_con) c(campo)
        where not exists (select 1 from public.listing_fields lf where lf.listing_id = l.id and lf.field_id = c.campo and lf.status in ('confirmado', 'probable')
                           and (lf.value = 'true'::jsonb or (jsonb_typeof(lf.value) = 'string' and lf.value <> '"no_tiene"'::jsonb))))
  ), filtrados as (
    select * from base where cardinality(v_tipos) = 0 or property_type = any(v_tipos)
  ), ordenados as (
    select b.id, row_number() over (order by
      case when f ->> 'orden' = 'precio_asc' then b.price end asc nulls last,
      case when f ->> 'orden' = 'precio_desc' then b.price end desc nulls last,
      case when f ->> 'orden' = 'm2_precio_asc' then b.price / nullif(b.area_m2, 0) end asc nulls last,
      case when f ->> 'orden' = 'superficie_desc' then b.area_m2 end desc nulls last,
      coalesce(b.published_at, b.created_at) desc, b.ref) as n
    from filtrados b
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'items', coalesce((select jsonb_agg(public.inmueble_resumen(l) order by o.n) from ordenados o join public.listings l on l.id = o.id where o.n > (v_pagina - 1) * v_por and o.n <= v_pagina * v_por), '[]'::jsonb),
    'puntos', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'precio', price, 'lat', extensions.st_y(location_public::extensions.geometry), 'lon', extensions.st_x(location_public::extensions.geometry))) from filtrados where location_public is not null), '[]'::jsonb),
    'facetas', jsonb_build_object(
      'tipos', coalesce((select jsonb_agg(jsonb_build_object('valor', t, 'n', n) order by n desc) from (select coalesce(property_type, 'otro') t, count(*) n from base group by 1) x), '[]'::jsonb),
      'zonas', coalesce((select jsonb_agg(jsonb_build_object('valor', t, 'n', n) order by n desc) from (select split_part(z.path, '/', 1) t, count(*) n from filtrados b join public.zones z on z.id = b.zone_id group by 1) x), '[]'::jsonb))
  ) into resultado;
  return resultado;
end $$;

create or replace function public.ficha_inmueble(p_operacion text, p_slug text)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.inmueble_resumen(l) || jsonb_build_object(
    'descripcion', coalesce((select t.description from public.listing_translations t where t.listing_id = l.id and t.locale = 'es'), ''),
    'descripcionTraducida', false,
    'campos', coalesce((select jsonb_object_agg(f.field_id, jsonb_build_object('value', f.value, 'confidence', f.confidence, 'status', f.status, 'evidenceIds', to_jsonb(f.evidence_ids), 'method', f.method, 'catalogVersion', f.catalog_version)) from public.listing_fields f where f.listing_id = l.id), '{}'::jsonb),
    'fotos', coalesce((select jsonb_agg(coalesce(md.url, md.storage_path) order by md.is_cover desc, md.position) from public.listing_media md where md.listing_id = l.id), '[]'::jsonb),
    'distancias', coalesce((select jsonb_agg(jsonb_build_object('categoria', d.category, 'nombre', p.name, 'metros', d.distance_m, 'minutos', d.walk_min) order by d.category, d.distance_m) from public.listing_poi_distances d join public.pois p on p.id = d.poi_id where d.listing_id = l.id), '[]'::jsonb),
    'agente', (select jsonb_build_object('nombre', a.display_name, 'telefono', a.public_phone, 'email', a.public_email) from public.agents a where a.id = l.agent_id))
  from public.listings l
  where l.slug = p_slug and (l.operation::text = p_operacion or (p_operacion = 'alquiler' and l.operation = 'alquiler_vacacional'))
  limit 1
$$;

grant execute on function public.inmueble_resumen(public.listings), public.buscar_inmuebles(jsonb), public.ficha_inmueble(text, text) to anon, authenticated, service_role;
