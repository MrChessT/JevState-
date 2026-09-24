begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

-- Datos de prueba ---------------------------------------------------------------------------
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'agente-a@test'),
  ('00000000-0000-0000-0000-00000000000c', 'editor-a@test'),
  ('00000000-0000-0000-0000-00000000000d', 'agente-b@test'),
  ('00000000-0000-0000-0000-00000000000e', 'usuario@test'),
  ('00000000-0000-0000-0000-00000000000f', 'otro@test');

insert into agencies(id, slug, name) values
  ('10000000-0000-0000-0000-00000000000a', 'agencia-a', 'Agencia A'),
  ('10000000-0000-0000-0000-00000000000b', 'agencia-b', 'Agencia B');

insert into agents(id, agency_id, user_id, role, display_name) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'admin', 'Admin A'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'agente', 'Agente A'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'editor', 'Editor A'),
  ('20000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d', 'agente', 'Agente B');

insert into listings(id, agency_id, ref, slug, status, operation, price, is_fictitious) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'A-1', 'piso-a-1', 'publicado', 'venta', 185000, true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'A-2', 'piso-a-2', 'borrador', 'venta', 99000, true),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000b', 'B-1', 'piso-b-1', 'publicado', 'alquiler', 850, true);

insert into listing_private(listing_id, agency_id, owner_name, commission_pct)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Propietario', 3);

insert into listing_fields(listing_id, agency_id, field_id, value, confidence, status, method, catalog_version, is_public) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'terraza', 'true', 0.93, 'confirmado', 'verify', 'v', true),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'rentabilidad_declarada', '5.2', 0.9, 'probable', 'mini', 'v', false),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'terraza', 'true', 0.93, 'confirmado', 'verify', 'v', true);

insert into leads(id, agency_id, origin, kind, name) values
  ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'telefono', 'contacto', 'Lead A'),
  ('40000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'telefono', 'contacto', 'Lead B');

insert into favorites(user_id, listing_id, agency_id) values
  ('00000000-0000-0000-0000-00000000000e', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000f', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000b');

-- Anónimo (portal) ------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select is((select count(*)::int from listings), 2, 'anon: solo inmuebles publicados');
select is((select count(*)::int from listing_fields), 1, 'anon: solo campos públicos de inmuebles visibles');
select is((select count(*)::int from listing_price_history), 2, 'anon: historial de precio de los visibles');
select throws_ok('select * from listing_private', '42501', null, 'anon: sin acceso a datos privados');
select throws_ok('select user_id from agents', '42501', null, 'anon: el enlace agente-cuenta no es público');
select lives_ok('select id, display_name from agents', 'anon: la ficha pública del equipo sí');
select throws_ok('select * from leads', '42501', null, 'anon: sin acceso a leads');
select throws_ok('select * from jobs', '42501', null, 'anon: sin acceso a la cola de trabajos');

-- Agente de la agencia A --------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select is((select count(*)::int from listings where agency_id = '10000000-0000-0000-0000-00000000000a'), 2, 'agente A: ve también los borradores de su agencia');
select is((select count(*)::int from listings where agency_id = '10000000-0000-0000-0000-00000000000b'), 1, 'agente A: de otra agencia, solo lo publicado');
select is((select count(*)::int from listing_private), 1, 'agente A: ve los datos privados de su agencia');
select is((select array_agg(name) from leads), array['Lead A'], 'agente A: solo leads de su agencia');
select is((select count(*)::int from listing_fields where listing_id = '30000000-0000-0000-0000-000000000001'), 2, 'agente A: ve también los campos internos');

-- Editor de A: contenido sí, CRM y datos privados no ----------------------------------------------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}';
select is((select count(*)::int from leads), 0, 'editor: no ve leads');
select is((select count(*)::int from listing_private), 0, 'editor: no ve datos privados');
select lives_ok($$update listings set slug = 'piso-a-2-nuevo' where id = '30000000-0000-0000-0000-000000000002'$$, 'editor: puede editar inmuebles');

-- Agente de B no puede tocar A --------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}';
update listings set price = 1 where id = '30000000-0000-0000-0000-000000000001';
reset role;
select is((select price from listings where id = '30000000-0000-0000-0000-000000000001'), 185000.00::numeric, 'agente B: no modifica inmuebles de A');
set local role authenticated;

-- Usuario del portal: solo lo suyo ----------------------------------------------------------------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}';
select is((select count(*)::int from favorites), 1, 'usuario: solo sus favoritos');
select throws_ok(
  $$insert into favorites(user_id, listing_id, agency_id) values ('00000000-0000-0000-0000-00000000000f', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'usuario: no crea favoritos a nombre de otro');
select is((select count(*)::int from leads), 0, 'usuario: no ve leads ajenos');
select is((select count(*)::int from audit_log), 0, 'usuario: no ve la auditoría');

-- Auditoría y admin ------------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select ok((select count(*) from audit_log where table_name = 'listings') >= 1, 'admin A: ve la auditoría de su agencia');
select is((select count(*)::int from audit_log where agency_id = '10000000-0000-0000-0000-00000000000b'), 0, 'admin A: no ve la auditoría de B');
select ok((select actor from audit_log where table_name = 'listings' and action = 'UPDATE' order by id desc limit 1) = '00000000-0000-0000-0000-00000000000c', 'la auditoría registra quién cambió qué');
select is((select array_agg(role::text) from mis_membresias()), array['admin'], 'mis_membresias: solo las del usuario actual');
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}';
select is((select count(*)::int from mis_membresias()), 0, 'mis_membresias: un usuario del portal no tiene ninguna');

select * from finish();
rollback;
