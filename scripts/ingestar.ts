// npm run ingestar -- --archivo datos/ficticios/feed.xml [--paginas datos/ficticios/paginas] [--supabase] [--sin-jev]
// Procesa un feed (XML de portales o CSV) de principio a fin. Sin --supabase guarda en memoria y
// muestra un resumen (útil en desarrollo y para revisar el catálogo). Con --supabase encola cada
// inmueble como trabajo sde.enriquecer (lo procesa el worker).
import fs from "node:fs";
import path from "node:path";
import { CATALOG } from "../src/catalog/index";
import { loadConfig } from "../src/config/env";
import { AdaptadorCsv } from "../src/ingesta/csv";
import { leerFuente, type AdaptadorFuente } from "../src/ingesta/tipos";
import { AdaptadorXmlPortales } from "../src/ingesta/xml-portales";
import { createJev } from "../src/jev/factory";
import { Metrics } from "../src/observability/metrics";
import { AlmacenMemoria } from "../src/pipeline/almacen";
import { procesarRegistro } from "../src/pipeline/procesar";
import { supabaseAdmin } from "../src/server/supabase-admin";
import { GeocoderLocal } from "../src/zonas/geocodificar";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (nombre: string) => process.argv.includes(`--${nombre}`);

export function adaptadorDeArchivo(archivo: string, paginas?: string, ficticio = false): AdaptadorFuente {
  const cargar = async () => fs.readFileSync(archivo, "utf8");
  if (archivo.endsWith(".csv")) return new AdaptadorCsv("csv_manual", cargar, true, "Importación CSV de inmuebles propios de la agencia");
  return new AdaptadorXmlPortales(ficticio ? "ficticios" : "crm_feed", cargar, true, ficticio ? "Datos ficticios de desarrollo" : "Feed de inmuebles propios de la agencia", {
    ficticio,
    paginas: paginas ? async (ref) => (fs.existsSync(path.join(paginas, `${ref}.html`)) ? fs.readFileSync(path.join(paginas, `${ref}.html`), "utf8") : undefined) : undefined,
  });
}

async function main() {
  const archivo = arg("archivo");
  if (!archivo) throw new Error("Uso: npm run ingestar -- --archivo <feed.xml|inmuebles.csv> [--paginas dir] [--supabase] [--sin-jev]");
  const ficticio = flag("ficticio") || archivo.includes("ficticios");
  const adaptador = adaptadorDeArchivo(archivo, arg("paginas"), ficticio);

  if (flag("supabase")) {
    const db = supabaseAdmin();
    const agencyId = process.env.AGENCY_ID;
    if (!agencyId) throw new Error("Falta AGENCY_ID");
    let n = 0;
    for await (const x of leerFuente(adaptador)) {
      if (!x.ok) {
        console.warn(`registro ${x.indice} no válido: ${x.error}`);
        continue;
      }
      const { error } = await db.rpc("trabajos_encolar", { p_kind: "sde.enriquecer", p_payload: { registro: x.registro, hash: x.hash }, p_dedupe: `sde:${x.registro.adaptador}:${x.registro.sourceId}:${x.hash}`, p_agency: agencyId });
      if (error) throw new Error(error.message);
      n++;
    }
    console.log(`${n} inmuebles encolados. El worker los procesará (npm run worker).`);
    return;
  }

  const config = loadConfig();
  const metrics = new Metrics(config.jev.pricePerMtokUsd);
  const jev = createJev(config, metrics);
  const almacen = new AlmacenMemoria();
  const resumen = { procesados: 0, publicados: 0, borradores: 0, invalidos: 0, revisiones: 0, llamadasJev: 0 };
  const estados: Record<string, number> = {};
  for await (const x of leerFuente(adaptador)) {
    if (!x.ok) {
      resumen.invalidos++;
      continue;
    }
    const r = await procesarRegistro(x.registro, x.hash, { jev, catalog: CATALOG, geocoder: new GeocoderLocal(), almacen, agencyId: "local", modo: flag("sin-jev") ? "sin_jev" : "normal" });
    resumen.procesados++;
    if (r.estado === "publicado") resumen.publicados++;
    else resumen.borradores++;
    resumen.revisiones += r.cascada?.revisiones.length ?? 0;
    resumen.llamadasJev += r.cascada?.paquetes.filter((p) => p.llamada).length ?? 0;
    for (const f of Object.values(r.cascada?.canonico.campos ?? {})) estados[f.status] = (estados[f.status] ?? 0) + 1;
  }
  console.log(`Jev: ${config.jev.via} (${jev.model})`);
  console.table(resumen);
  console.table(estados);
  console.log(JSON.stringify(metrics.snapshot().jev));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
