begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

insert into agencies(id, slug, name) values ('10000000-0000-0000-0000-00000000000c', 'agencia-c', 'Agencia C');
insert into listings(id, agency_id, ref, slug, status, operation, zone_id, price, area_m2, bedrooms, property_type, is_fictitious) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000c', 'C1', 'piso-ref-c1', 'publicado', 'venta', (select id from zones where path = 'murcia'), 150000, 80, 3, 'piso', true),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000c', 'C2', 'piso-ref-c2', 'borrador', 'venta', (select id from zones where path = 'murcia'), 150000, 80, 3, 'piso', true);

-- Solo el servidor puede registrar contactos.
set local role anon;
select throws_ok($$select registrar_contacto('{"ref":"C1","email":"a@b.es","consentimiento":true,"sujeto_hash":"h"}')$$, '42501', null, 'anon no puede registrar contactos');
reset role;
set local role service_role;

select isnt(registrar_contacto('{"ref":"C1","tipo":"contacto","nombre":"Ana","email":"Ana@Ejemplo.es","mensaje":"¿Sigue disponible?","consentimiento":true,"sujeto_hash":"h1"}'), null, 'registra un contacto');
select is((select email from leads where name = 'Ana'), 'ana@ejemplo.es', 'el email se normaliza');
select isnt((select consent_id from leads where name = 'Ana'), null, 'queda ligado a su consentimiento');
select is((select listing_id from leads where name = 'Ana'), '50000000-0000-0000-0000-000000000001'::uuid, 'y a su inmueble');

select lives_ok($$select registrar_contacto('{"ref":"C1","tipo":"visita","nombre":"Luis","telefono":"600000000","fecha":"2026-10-10","franja":"tarde","consentimiento":true,"sujeto_hash":"h2"}')$$, 'visita con fecha');
select is((select v.status::text from visits v join leads l on l.id = v.lead_id where l.name = 'Luis'), 'solicitada', 'crea la visita solicitada');

select throws_ok($$select registrar_contacto('{"ref":"C1","email":"x@y.es","consentimiento":false,"sujeto_hash":"h3"}')$$, '22023', null, 'sin consentimiento no se guarda');
select throws_ok($$select registrar_contacto('{"ref":"C1","consentimiento":true,"sujeto_hash":"h4"}')$$, '22023', null, 'sin email ni teléfono no se guarda');
select throws_ok($$select registrar_contacto('{"ref":"C2","email":"x@y.es","consentimiento":true,"sujeto_hash":"h5"}')$$, '22023', null, 'un borrador no admite contactos');

select * from finish();
rollback;
