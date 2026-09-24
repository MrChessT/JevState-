// npm run zonas:sql [-- --check]
// Genera supabase/migrations/0008_zonas_region_murcia.sql desde src/zonas/datos.ts: una sola fuente
// para el código (búsqueda difusa en memoria) y la base de datos (buscar_zonas, filtros, SEO).
import fs from "node:fs";
import path from "node:path";
import { BARRIOS, colindancias, MUNICIPIOS } from "../src/zonas/datos";

const DESTINO = path.resolve(import.meta.dirname, "..", "supabase", "migrations", "0008_zonas_region_murcia.sql");
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: string[]) => (xs.length ? `array[${xs.map(q).join(", ")}]::text[]` : "'{}'::text[]");
const punto = (lat: number, lon: number) => `extensions.st_setsrid(extensions.st_makepoint(${lon}, ${lat}), 4326)::extensions.geography`;

export function generar(): string {
  const municipios = MUNICIPIOS.map((m) => `  (${q(m.slug)}, ${q(m.slug)}, ${q(m.nombre)}, ${arr(m.alias)}, ${q(m.ine)}, ${punto(m.lat, m.lon)})`).join(",\n");
  const barrios = BARRIOS.map((b) => `  (${q(b.municipio)}, ${q(`${b.municipio}/${b.slug}`)}, ${q(b.slug)}, ${q(b.nombre)}, ${arr(b.alias)}, ${punto(b.lat, b.lon)})`).join(",\n");
  const pares: string[] = [];
  for (const [a, vecinos] of colindancias()) for (const b of [...vecinos].sort()) pares.push(`  (${q(a)}, ${q(b)})`);
  return `-- 0008 · Datos de referencia: municipios y barrios de la Región de Murcia.
-- ARCHIVO GENERADO por \`npm run zonas:sql\` desde src/zonas/datos.ts. No editar a mano.
-- Centroides y colindancias APROXIMADOS hasta cargar las geometrías del CNIG (docs/DECISIONES.md, D-111).

insert into public.zones (level, path, slug, name, aliases, ine_code, centroid)
select 'municipio', v.path, v.slug, v.name, v.aliases, v.ine, v.centroid
from (values
${municipios}
) as v(path, slug, name, aliases, ine, centroid)
on conflict (path) do update set name = excluded.name, aliases = excluded.aliases, ine_code = excluded.ine_code, centroid = excluded.centroid;

insert into public.zones (level, parent_id, path, slug, name, aliases, centroid)
select 'barrio', p.id, v.path, v.slug, v.name, v.aliases, v.centroid
from (values
${barrios}
) as v(parent_path, path, slug, name, aliases, centroid)
join public.zones p on p.path = v.parent_path
on conflict (path) do update set parent_id = excluded.parent_id, name = excluded.name, aliases = excluded.aliases, centroid = excluded.centroid;

insert into public.zone_adjacency (zone_id, neighbor_id)
select a.id, b.id
from (values
${pares.join(",\n")}
) as v(a, b)
join public.zones a on a.path = v.a
join public.zones b on b.path = v.b
on conflict do nothing;

-- Con geometrías oficiales cargadas, las colindancias se recalculan a partir de ellas.
create or replace function app.recalcular_colindancias() returns int
language plpgsql security definer
set search_path = ''
as $$
declare n int;
begin
  insert into public.zone_adjacency (zone_id, neighbor_id)
  select a.id, b.id from public.zones a join public.zones b
    on a.id <> b.id and a.level = b.level and a.geom is not null and b.geom is not null
   and extensions.st_touches(a.geom::extensions.geometry, b.geom::extensions.geometry)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.recalcular_colindancias() from public, anon, authenticated;
grant execute on function app.recalcular_colindancias() to service_role;
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const sql = generar();
  const actual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8") : null;
  if (process.argv.includes("--check")) {
    if (actual !== sql) {
      console.error("0008_zonas_region_murcia.sql no está al día: ejecuta `npm run zonas:sql`.");
      process.exitCode = 1;
    } else console.log("Zonas al día.");
  } else if (actual !== sql) {
    fs.writeFileSync(DESTINO, sql);
    console.log(`Escrito ${path.relative(process.cwd(), DESTINO)} (${MUNICIPIOS.length} municipios, ${BARRIOS.length} barrios).`);
  } else console.log("Zonas al día.");
}
