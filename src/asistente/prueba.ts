// Prueba de extremo a extremo del asistente con Jev real (la usa /api/salud?jev=asistente).
import type { Thresholds } from "@/gates/thresholds";
import { toJevError } from "@/jev/errors";
import type { JevPort } from "@/jev/port";
import type { RepositorioPortal } from "@/portal/repositorio";
import { responder } from "./motor";

/** Mensajes fijos (sin datos de nadie): una búsqueda abierta y su continuación. */
const PRUEBA_MENSAJES = ["busco algo tranquilo cerca de la playa para teletrabajar, con buena luz, hasta 250.000", "que tenga terraza y sea más barato"];

/**
 * Prueba real del asistente con Jev (?jev=asistente): dos turnos por el motor de verdad,
 * registrando cada llamada a Jev (propósito, latencia, caché, error). Dice si el asistente
 * entiende con Jev o cae al modo básico, y por qué.
 */
export async function pruebaAsistente({ jev, repo, thresholds }: { jev: JevPort; repo: RepositorioPortal; thresholds: Thresholds }) {
  const llamadas: Array<{ turno: number; proposito: string; ok: boolean; ms: number; cache?: boolean; error?: string; detalle?: string }> = [];
  let turno = 0;
  const espia: JevPort = {
    model: jev.model,
    health: () => jev.health(),
    diagnostico: () => jev.diagnostico(),
    async ask(req) {
      const t0 = performance.now();
      try {
        const r = await jev.ask(req);
        llamadas.push({ turno, proposito: req.purpose, ok: true, ms: r.latencyMs, cache: r.cached });
        return r;
      } catch (err) {
        const e = toJevError(err);
        llamadas.push({ turno, proposito: req.purpose, ok: false, ms: Math.round(performance.now() - t0), error: e.code, detalle: e.message.split("\n")[0]!.replace(/(Bearer\s+|key[=:]\s*)[\w.-]+/gi, "$1***").slice(0, 200) });
        throw err;
      }
    },
  };
  const deps = { jev: espia, repo, thresholds };
  const turnos = [];
  let estado: Parameters<typeof responder>[0]["estado"];
  for (const mensaje of PRUEBA_MENSAJES) {
    turno += 1;
    const t0 = performance.now();
    const r = await responder({ mensaje, locale: "es", ...(estado ? { estado } : {}) }, deps);
    estado = r.respuesta.estado;
    turnos.push({
      mensaje,
      ms: Math.round(performance.now() - t0),
      llamadasJev: r.llamadasJev,
      modoBasico: r.respuesta.degradado,
      intencion: r.respuesta.intencion,
      resultados: r.respuesta.total,
      filtros: r.respuesta.chips.map((c) => c.texto),
      primerParrafo: r.respuesta.parrafos[0]?.slice(0, 200) ?? null,
    });
  }
  const fallos = llamadas.filter((l) => !l.ok);
  return { ok: fallos.length === 0 && llamadas.length > 0 && turnos.every((t) => !t.modoBasico), turnos, llamadas };
}

