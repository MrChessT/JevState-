-- 0011 · Rendimiento de lectura del portal.
-- · Índices para la ficha (por slug), los listados «recientes» y el prefijo de zona.
-- · Una sola llamada para toda la oferta publicada (antes: páginas de 48 en bucle).
-- · Resúmenes y fichas por referencia (favoritos y comparador) sin descargar toda la oferta.
-- · Estadística de zona calculada en SQL con TODA la muestra (antes: solo los 48 primeros).

create index if not exists listings_slug_idx on public.listings(slug);
create index if not exists listings_publicados_idx on public.listings(operation, published_at desc) where status in ('publicado', 'reservado');
create index if not exists zones_path_prefix_idx on public.zones(path text_pattern_ops);

-- Toda la oferta publicada, en una llamada (RLS decide qué ve cada cual).
create or replace function public.inmuebles_publicados()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.inmueble_resumen(l) order by l.published_at desc nulls last, l.ref), '[]'::jsonb)
  from public.listings l
  where l.status in ('publicado', 'reservado')
$$;

-- Resúmenes por referencia, en el orden pedido (máximo 50).
create or replace function public.inmuebles_por_ref(p_refs text[])
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.inmueble_resumen(l) order by array_position(p_refs, l.ref)), '[]'::jsonb)
  from public.listings l
  where l.ref = any (p_refs[1:50]) and l.status in ('publicado', 'reservado')
$$;

-- Fichas completas por referencia (comparador, máximo 3).
create or replace function public.fichas_por_ref(p_refs text[])
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.ficha_inmueble(case when l.operation = 'venta' then 'venta' else 'alquiler' end, l.slug) order by array_position(p_refs, l.ref)), '[]'::jsonb)
  from public.listings l
  where l.ref = any (p_refs[1:3]) and l.status in ('publicado', 'reservado')
$$;

-- Mediana y cuartiles de €/m² de una zona (y sus barrios), con toda la muestra. Misma semántica
-- que estadisticaZona() en TypeScript: interpolación lineal, redondeo a entero, mínimo 3.
create or replace function public.estadistica_zona(p_path text, p_operacion text)
returns jsonb
language sql stable
set search_path = ''
as $$
  with m as (
    select l.price / l.area_m2 as m2
    from public.listings l
    join public.zones z on z.id = l.zone_id
    where l.status in ('publicado', 'reservado')
      and l.operation::text = p_operacion
      and (z.path = p_path or z.path like p_path || '/%')
      and l.price > 0 and l.area_m2 > 0
  ), c as (
    select count(*) as n,
           percentile_cont(0.5) within group (order by m2) as p50,
           percentile_cont(0.25) within group (order by m2) as p25,
           percentile_cont(0.75) within group (order by m2) as p75
    from m
  )
  select jsonb_build_object(
    'path', p_path,
    'n', n,
    'medianaM2', case when n >= 3 then round(p50::numeric)::text end,
    'p25M2', case when n >= 3 then round(p25::numeric)::text end,
    'p75M2', case when n >= 3 then round(p75::numeric)::text end)
  from c
$$;

grant execute on function public.inmuebles_publicados(), public.inmuebles_por_ref(text[]), public.fichas_por_ref(text[]), public.estadistica_zona(text, text) to anon, authenticated, service_role;
