// npm run worker [-- --una-vez]
// Procesa la cola de trabajos (tabla jobs) con service_role. Pensado para un cron (--una-vez) o un
// proceso largo. Trabajos: sde.enriquecer { registro, hash }.
// Reintentos: los gestiona la cola (backoff exponencial); en el ÚLTIMO intento se usa el modo
// sin_jev para que un Jev caído no bloquee la publicación (lo dudoso queda en revisión, D-121).
import os from "node:os";
import { CATALOG } from "../src/catalog/index";
import { loadConfig } from "../src/config/env";
import { RegistroFuente } from "../src/ingesta/tipos";
import { createJev } from "../src/jev/factory";
import { logger } from "../src/observability/logger";
import { Metrics } from "../src/observability/metrics";
import { AlmacenSupabase } from "../src/pipeline/almacen";
import { procesarRegistro } from "../src/pipeline/procesar";
import { supabaseAdmin } from "../src/server/supabase-admin";
import { GeocoderLocal } from "../src/zonas/geocodificar";

interface Trabajo {
  id: number;
  agency_id: string | null;
  kind: string;
  payload: { registro?: unknown; hash?: string };
  attempts: number;
  max_attempts: number;
}

async function main() {
  const unaVez = process.argv.includes("--una-vez");
  const db = supabaseAdmin();
  const config = loadConfig();
  const metrics = new Metrics(config.jev.pricePerMtokUsd);
  const jev = createJev(config, metrics);
  const almacen = new AlmacenSupabase(db);
  const geocoder = new GeocoderLocal();
  const worker = `${os.hostname()}:${process.pid}`;
  const log = logger.child({ worker });

  for (;;) {
    const { data, error } = await db.rpc("trabajos_reservar", { p_kind: "sde.enriquecer", p_n: 5, p_worker: worker });
    if (error) throw new Error(error.message);
    const trabajos = (data ?? []) as Trabajo[];
    if (trabajos.length === 0) {
      if (unaVez) break;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    await Promise.all(
      trabajos.map(async (t) => {
        try {
          const registro = RegistroFuente.parse(t.payload.registro);
          const ultimo = t.attempts >= t.max_attempts;
          const r = await procesarRegistro(registro, t.payload.hash ?? "", { jev, catalog: CATALOG, geocoder, almacen, agencyId: t.agency_id!, modo: ultimo ? "sin_jev" : "normal" });
          log.info("sde.hecho", { trabajo: t.id, ref: r.ref, omitido: r.omitido, estado: r.estado, version: r.canonicalVersion, modo: ultimo ? "sin_jev" : "normal" });
          await db.rpc("trabajos_terminar", { p_id: t.id, p_error: null });
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : String(err);
          log.warn("sde.error", { trabajo: t.id, intento: t.attempts, error: mensaje });
          await db.rpc("trabajos_terminar", { p_id: t.id, p_error: mensaje });
        }
      }),
    );
  }
  log.info("worker.fin", { jev: metrics.snapshot().jev });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
