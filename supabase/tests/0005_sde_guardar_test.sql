begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000a', 'admin@test');
insert into agencies(id, slug, name) values ('10000000-0000-0000-0000-00000000000a', 'agencia', 'Agencia');

create temporary table payload as select jsonb_build_object(
  'agency_id', '10000000-0000-0000-0000-00000000000a',
  'listing', jsonb_build_object('ref', 'F-1', 'slug', 'piso-3-hab-ref-f-1', 'status', 'publicado', 'operation', 'venta', 'zone_path', 'cartagena/ensanche',
    'lat', 37.61, 'lon', -0.98, 'canonical', '{"campos": {"precio": 1}}'::jsonb, 'catalog_version', 'v1', 'price', 185000, 'area_m2', 90,
    'bedrooms', 3, 'bathrooms', 2, 'property_type', 'piso', 'source', 'feed', 'source_id', 'S-1', 'content_hash', 'h1', 'is_fictitious', true),
  'private', jsonb_build_object('address_exact', 'Calle Real 5', 'lat', 37.6101, 'lon', -0.9801),
  'evidence', jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-0000-5000-8000-000000000001', 'source', 'feed', 'path', 'price', 'raw', '185000',
    'parsed', '{"valor": "185000"}'::jsonb, 'sourceWeight', 0.95, 'capturedAt', '2026-09-24T10:00:00Z')),
  'fields', jsonb_build_array(
    jsonb_build_object('field_id', 'precio', 'value', '"185000"'::jsonb, 'confidence', 0.95, 'status', 'confirmado', 'method', 'mini',
      'evidence_ids', jsonb_build_array('aaaaaaaa-0000-5000-8000-000000000001'), 'catalog_version', 'v1', 'is_public', true),
    jsonb_build_object('field_id', 'ascensor', 'value', 'true'::jsonb, 'confidence', 0.7, 'status', 'probable', 'method', 'reasoning',
      'evidence_ids', '[]'::jsonb, 'catalog_version', 'v1', 'is_public', true)),
  'reviews', jsonb_build_array(jsonb_build_object('field_id', 'ascensor', 'reason', 'campo_dudoso', 'proposed', 'true'::jsonb, 'confidence', 0.7, 'catalog_version', 'v1')),
  'decisions', jsonb_build_array(jsonb_build_object('purpose', 'sde.fisico', 'questionId', 'ascensor', 'questionType', 'noul', 'answer', '{"type":"noul","noul":0.7}'::jsonb,
    'gateKey', 'campo:ascensor', 'gate', '{"act":0.85,"ask":0.6}'::jsonb, 'outcome', 'confirmar', 'catalogVersion', 'v1', 'model', 'jev-fake')),
  'translations', jsonb_build_array(jsonb_build_object('locale', 'es', 'title', 'Piso en el Ensanche', 'description', 'Luminoso')),
  'media', jsonb_build_array(jsonb_build_object('url', 'https://example.com/1.jpg', 'position', 0))
) as p;

select is((select (sde_guardar(p) ->> 'canonical_version')::int from payload), 1, 'alta: versión canónica 1');
select is((select zone_id from listings where ref = 'F-1'), (select id from zones where path = 'cartagena/ensanche'), 'zona asignada por ruta');
select is((select count(*)::int from listing_fields where listing_id = (select id from listings where ref = 'F-1')), 2, 'campos guardados');
select is((select count(*)::int from review_queue where status = 'pendiente'), 1, 'cola de revisión');
select is((select count(*)::int from jev_decisions), 1, 'decisión auditada');
select is((select count(*)::int from listing_price_history), 1, 'historial de precio');

-- Reproceso idéntico: no cambia la versión, no duplica evidencias ni revisiones.
select is((select (sde_guardar(p) ->> 'cambio')::boolean from payload), false, 'mismo canónico: sin cambio');
select is((select count(*)::int from listing_evidence), 1, 'evidencias sin duplicar');
select is((select count(*)::int from review_queue where status = 'pendiente'), 1, 'revisión sin duplicar');

-- Corrección manual: el pipeline no la toca.
update listing_fields set value = 'false', method = 'manual', status = 'confirmado', updated_by = '00000000-0000-0000-0000-00000000000a' where field_id = 'ascensor';
select lives_ok($$select sde_guardar(p) from payload$$, 'reprocesar con un campo manual no falla');
select is((select value from listing_fields where field_id = 'ascensor'), 'false'::jsonb, 'la corrección manual se conserva');

-- Solo service_role.
set local role authenticated;
select throws_ok($$select sde_guardar('{}'::jsonb)$$, '42501', null, 'un usuario no puede escribir por el pipeline');
reset role;

select * from finish();
rollback;
