begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

insert into agencies(id, slug, name) values ('10000000-0000-0000-0000-00000000000b', 'agencia-b', 'Agencia B');
insert into listings(id, agency_id, ref, slug, status, operation, zone_id, price, area_m2, bedrooms, property_type, is_fictitious) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'B1', 'piso-ref-b1', 'publicado', 'venta', (select id from zones where path = 'murcia/el-carmen'), 100000, 100, 3, 'piso', true),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000b', 'B2', 'piso-ref-b2', 'publicado', 'venta', (select id from zones where path = 'murcia/centro'), 200000, 100, 3, 'piso', true),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000b', 'B3', 'piso-ref-b3', 'publicado', 'venta', (select id from zones where path = 'murcia'), 300000, 100, 3, 'piso', true),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000b', 'B4', 'piso-ref-b4', 'borrador', 'venta', (select id from zones where path = 'murcia'), 900000, 100, 3, 'piso', true);

set local role anon;
select is(jsonb_array_length(inmuebles_publicados()), 3, 'toda la oferta publicada en una llamada');
select is(inmuebles_por_ref(array['B3', 'B1']) -> 0 ->> 'ref', 'B3', 'por referencia, en el orden pedido');
select is(jsonb_array_length(inmuebles_por_ref(array['B1', 'B4', 'NO'])), 1, 'por referencia: nunca borradores ni inexistentes');
select is(fichas_por_ref(array['B2']) -> 0 ->> 'ref', 'B2', 'ficha completa por referencia');
select ok(fichas_por_ref(array['B2']) -> 0 ? 'campos', 'la ficha trae sus campos');
select is(estadistica_zona('murcia', 'venta') ->> 'n', '3', 'la zona incluye sus barrios y excluye borradores');
select is(estadistica_zona('murcia', 'venta') ->> 'medianaM2', '2000', 'mediana con toda la muestra');
select is(estadistica_zona('murcia', 'venta') ->> 'p25M2', '1500', 'percentil 25 con interpolación lineal');
select is(estadistica_zona('murcia/centro', 'venta') ->> 'medianaM2', null, 'con menos de 3 no se publica');
select * from finish();
rollback;
