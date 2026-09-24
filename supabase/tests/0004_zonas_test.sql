begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

select is((select count(*)::int from zones where level = 'municipio'), 45, '45 municipios de la Región de Murcia');
select ok((select count(*) from zones where level = 'barrio') >= 60, 'barrios y pedanías cargados');
select is((select ine_code from zones where path = 'cartagena'), '30016', 'código INE de Cartagena');
select is((select path from buscar_zonas('cartajena') limit 1), 'cartagena', 'erratas: cartajena → Cartagena');
select is((select path from buscar_zonas('santiago de la rivera') limit 1), 'san-javier/santiago-de-la-ribera', 'erratas en barrios');
select ok(exists (select 1 from zone_adjacency a join zones x on x.id = a.zone_id join zones y on y.id = a.neighbor_id where x.path = 'los-alcazares' and y.path = 'san-javier'), 'colindancias cargadas');
select ok((select extensions.st_y(centroid::extensions.geometry) from zones where path = 'murcia') between 37.9 and 38.1, 'centroides en su sitio');

select * from finish();
rollback;
