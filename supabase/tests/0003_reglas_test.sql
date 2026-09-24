begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000a', 'admin@test');
insert into agencies(id, slug, name) values ('10000000-0000-0000-0000-00000000000a', 'agencia', 'Agencia');
insert into listings(id, agency_id, ref, slug, status, operation, price) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'R-1', 'r-1', 'borrador', 'venta', 200000);

-- Correcciones manuales: siempre ganan -------------------------------------------------------------
insert into listing_fields(listing_id, agency_id, field_id, value, confidence, status, method, catalog_version, updated_by)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'ascensor', 'true', 1, 'confirmado', 'manual', 'v', '00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$update listing_fields set value = 'false', method = 'reasoning' where field_id = 'ascensor'$$,
  'P0001', null, 'el pipeline no sobrescribe una corrección manual');
select lives_ok(
  $$update listing_fields set value = 'false', updated_by = '00000000-0000-0000-0000-00000000000a' where field_id = 'ascensor'$$,
  'una corrección manual sí se puede volver a corregir a mano');
select throws_ok(
  $$insert into listing_fields(listing_id, agency_id, field_id, value, status, method, catalog_version) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'terraza', 'true', 'no_consta', 'reasoning', 'v')$$,
  '23514', null, 'no_consta no lleva valor');

-- Historial de precio y publicación ----------------------------------------------------------
update listings set price = 190000, status = 'publicado' where id = '30000000-0000-0000-0000-000000000001';
select is((select array_agg(price order by id) from listing_price_history), array[200000.00, 190000.00]::numeric[], 'cada cambio de precio queda en el historial');
select isnt((select published_at from listings where id = '30000000-0000-0000-0000-000000000001'), null, 'al publicar se registra la fecha');

-- Fuentes externas: solo con base legal --------------------------------------------------------
select throws_ok(
  $$insert into data_sources(code, name, kind, legal_ok, legal_basis, active) values ('portal_x', 'Portal X', 'web_autorizada', false, 'ninguna', true)$$,
  '23514', null, 'una fuente sin base legal no puede activarse');
insert into data_sources(id, code, name, kind, legal_ok, legal_basis) values
  ('50000000-0000-0000-0000-000000000001', 'sin_permiso', 'Sin permiso', 'licencia', false, 'pendiente'),
  ('50000000-0000-0000-0000-000000000002', 'notariado', 'Consejo General del Notariado', 'datos_abiertos', true, 'Datos abiertos, reutilización permitida');
select throws_ok(
  $$insert into market_comparables(agency_id, source_id, property_type, area_m2, price, price_kind, observed_at) values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'piso', 80, 150000, 'oferta', current_date)$$,
  'P0001', null, 'no se admiten comparables de fuentes sin base legal');
select lives_ok(
  $$insert into market_comparables(agency_id, source_id, property_type, area_m2, price, price_kind, observed_at) values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002', 'piso', 80, 150000, 'cierre', current_date)$$,
  'comparables de datos abiertos sí');

-- Consentimientos inmutables -----------------------------------------------------------------
insert into consents(id, agency_id, subject_hash, purpose, legal_basis, granted, text_version)
values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'h', 'contacto', 'consentimiento', true, 'v1');
select throws_ok($$update consents set granted = false$$, 'P0001', null, 'los consentimientos no se modifican');

-- Cola de trabajos con reintentos ------------------------------------------------------------------
insert into jobs(kind, payload, max_attempts, dedupe_key) values ('sde.enriquecer', '{"listing": "R-1"}', 2, 'sde:R-1:h1');
select is((select count(*)::int from app.reservar_trabajos('sde.enriquecer', 10, 'w1')), 1, 'se reserva un trabajo listo');
select app.terminar_trabajo((select id from jobs limit 1), 'timeout');
update jobs set run_after = now() - interval '1 second';
select app.reservar_trabajos('sde.enriquecer', 10, 'w1');
select app.terminar_trabajo((select id from jobs limit 1), 'timeout');
select is((select status::text from jobs limit 1), 'fallido', 'tras max_attempts el trabajo queda fallido');

select * from finish();
rollback;
