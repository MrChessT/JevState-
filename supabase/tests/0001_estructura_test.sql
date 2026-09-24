begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

-- RLS en TODAS las tablas de public (regla del proyecto).
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      and c.relname <> 'spatial_ref_sys'),
  '',
  'todas las tablas de public tienen RLS'
);

-- Modelo de datos mínimo (sección 6.1).
select has_table('public', t, 'existe ' || t) from unnest(array[
  'agencies'
]) as t;

select is(
  (select array_agg(t order by t) from unnest(array[
    'agencies', 'agents', 'listings', 'listing_fields', 'listing_evidence', 'listing_media', 'listing_price_history',
    'zones', 'pois', 'listing_poi_distances', 'market_comparables', 'valuations', 'profiles', 'saved_searches', 'alerts',
    'favorites', 'conversations', 'messages', 'search_states', 'jev_decisions', 'leads', 'visits', 'review_queue',
    'catalog_versions', 'consents', 'audit_log'
  ]) t where to_regclass('public.' || t) is null),
  null,
  'existen todas las tablas del modelo mínimo'
);

select ok(exists (select 1 from pg_extension where extname = 'postgis'), 'PostGIS instalado');
select ok(exists (select 1 from pg_extension where extname = 'pg_trgm'), 'pg_trgm instalado');
select ok(exists (select 1 from pg_extension where extname = 'unaccent'), 'unaccent instalado');

-- agency_id en todas las tablas de negocio (salvo geografía compartida y tablas técnicas).
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('spatial_ref_sys', 'agencies', 'zones', 'zone_adjacency', 'pois', 'listing_poi_distances', 'profiles', 'catalog_versions', 'data_sources', 'jobs')
      and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'agency_id' and not a.attisdropped)),
  '',
  'agency_id en todas las tablas de negocio'
);

-- Las funciones de mantenimiento no las puede ejecutar el público.
select ok(not has_function_privilege('anon', 'app.reservar_trabajos(text, int, text)', 'execute'), 'anon no reserva trabajos');

select * from finish();
rollback;
