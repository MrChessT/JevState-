// npm run poi:importar [-- --salida pois.json]
// Descarga los POI de la Región de Murcia desde OpenStreetMap (Overpass, ODbL) y los guarda en la
// tabla pois (service_role) o en un JSON. Necesita salida a internet hacia overpass-api.de.
import fs from "node:fs";
import { consultaOverpass, parsearOverpass } from "../src/poi/osm";
import { supabaseAdmin } from "../src/server/supabase-admin";

const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

async function main() {
  const res = await fetch(OVERPASS, { method: "POST", body: new URLSearchParams({ data: consultaOverpass() }), signal: AbortSignal.timeout(240_000) });
  if (!res.ok) throw new Error(`Overpass respondió ${res.status}`);
  const pois = parsearOverpass((await res.json()) as Parameters<typeof parsearOverpass>[0]);
  const i = process.argv.indexOf("--salida");
  if (i >= 0) {
    fs.writeFileSync(process.argv[i + 1]!, JSON.stringify(pois));
    console.log(`${pois.length} POI escritos en ${process.argv[i + 1]}`);
    return;
  }
  const db = supabaseAdmin();
  for (let k = 0; k < pois.length; k += 500) {
    const lote = pois.slice(k, k + 500).map((p) => ({ id: p.id, category: p.categoria, subcategory: p.subcategoria ?? null, name: p.nombre, geom: `SRID=4326;POINT(${p.lon} ${p.lat})`, osm_id: p.osmId, source: "osm" }));
    const { error } = await db.from("pois").upsert(lote, { onConflict: "osm_id" });
    if (error) throw new Error(error.message);
  }
  console.log(`${pois.length} POI importados (© OpenStreetMap contributors, ODbL).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
