begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

insert into agencies(id, slug, name) values ('10000000-0000-0000-0000-00000000000a', 'agencia', 'Agencia');
insert into listings(id, agency_id, ref, slug, status, operation, zone_id, price, area_m2, bedrooms, property_type, is_fictitious) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'A1', 'piso-3-hab-ref-a1', 'publicado', 'venta', (select id from zones where path = 'murcia/el-carmen'), 180000, 90, 3, 'piso', true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'A2', 'piso-2-hab-ref-a2', 'publicado', 'venta', (select id from zones where path = 'cartagena/ensanche'), 120000, 70, 2, 'piso', true),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', 'A3', 'piso-4-hab-ref-a3', 'borrador', 'venta', (select id from zones where path = 'murcia'), 90000, 100, 4, 'piso', true);
insert into listing_fields(listing_id, agency_id, field_id, value, confidence, status, method, catalog_version, is_public) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'terraza', 'true', 0.9, 'confirmado', 'verify', 'v', true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'terraza', 'true', 0.5, 'revisar', 'verify', 'v', true);

set local role anon;
select is((buscar_inmuebles('{"operacion":"venta"}') ->> 'total')::int, 2, 'solo publicados');
select is((buscar_inmuebles('{"operacion":"venta","zona":"murcia"}') ->> 'total')::int, 1, 'la zona incluye sus barrios');
select is((buscar_inmuebles('{"operacion":"venta","con":["terraza"]}') ->> 'total')::int, 1, 'requisito solo con confirmado o probable');
select is(buscar_inmuebles('{"operacion":"venta","orden":"precio_asc"}') -> 'items' -> 0 ->> 'ref', 'A2', 'orden por precio');
select is(buscar_inmuebles('{"operacion":"venta","con":["terraza"]}') -> 'items' -> 0 -> 'rasgos' -> 0 ->> 'campo', 'terraza', 'rasgos en la tarjeta');
select is(ficha_inmueble('venta', 'piso-3-hab-ref-a1') ->> 'ref', 'A1', 'ficha por slug');
select is(ficha_inmueble('venta', 'piso-4-hab-ref-a3'), null, 'un borrador no es visible');
select * from finish();
rollback;
