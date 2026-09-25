import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { LimiteFrecuencia } from "@/asistente/limites";
import { EntradaAsistente, responder, type DependenciasMotor } from "@/asistente/motor";
import { loadThresholds } from "@/gates/thresholds";
import { logger } from "@/observability/logger";
import { portal } from "@/portal/datos";
import { getRuntime } from "@/server/runtime";

// Asistente (sección 4): POST con el mensaje y el estado de la conversación. Con
// `Accept: text/event-stream` responde en streaming (fases y respuesta); si no, JSON.
export const maxDuration = 30;

const COOKIE = "asistente_sid";
let limites: { ip: LimiteFrecuencia; sesion: LimiteFrecuencia } | null = null;
const thresholds = loadThresholds();

function ipDe(request: NextRequest): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(request: NextRequest) {
  const { config, jev, metrics } = getRuntime();
  limites ??= { ip: new LimiteFrecuencia(config.RATE_CHAT_PER_MIN_IP), sesion: new LimiteFrecuencia(config.RATE_CHAT_PER_MIN_SESSION) };
  const sid = request.cookies.get(COOKIE)?.value ?? randomUUID();
  const ip = ipDe(request);
  if (!limites.ip.permitir(ip) || !limites.sesion.permitir(sid)) {
    const espera = Math.max(limites.ip.espera(ip), limites.sesion.espera(sid));
    return NextResponse.json({ error: "demasiadas_peticiones", espera }, { status: 429, headers: { "Retry-After": String(espera) } });
  }
  let entrada: EntradaAsistente;
  try {
    entrada = EntradaAsistente.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "peticion_no_valida" }, { status: 400 });
  }

  // Sin clave de Jev (Jev simulado) el asistente trabaja en modo degradado: un Jev simulado sin
  // guion no «entiende» nada y respondería peor que las palabras clave.
  const base: Omit<DependenciasMotor, "progreso"> = { jev: jev.model === "jev-fake" ? null : jev, repo: await portal(), thresholds, signal: request.signal };
  const inicio = performance.now();
  const registrar = (r: Awaited<ReturnType<typeof responder>>) => {
    const ms = performance.now() - inicio;
    metrics.recordLatency("asistente.total", ms);
    for (const d of r.decisiones) metrics.recordGate(d.gate, d.outcome);
    logger.info("asistente.respuesta", {
      intencion: r.respuesta.intencion,
      llamadasJev: r.llamadasJev,
      degradado: r.respuesta.degradado,
      total: r.respuesta.total,
      ms: Math.round(ms),
      decisiones: r.decisiones.map((d) => ({ id: d.id, gate: d.gate, outcome: d.outcome, elegido: d.elegido, confianza: Math.round(d.confianza * 1000) / 1000 })),
    });
  };
  const cookie = { name: COOKIE, value: sid, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/asistente", maxAge: 60 * 60 * 24 };

  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    try {
      const r = await responder(entrada, base);
      registrar(r);
      const res = NextResponse.json(r.respuesta);
      res.cookies.set(cookie);
      return res;
    } catch (e) {
      logger.error("asistente.error", { error: String(e) });
      return NextResponse.json({ error: "error_interno" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (evento: string, datos: unknown) => controller.enqueue(encoder.encode(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`));
      try {
        const r = await responder(entrada, { ...base, progreso: (fase) => enviar("fase", { fase }) });
        registrar(r);
        enviar("fase", { fase: "respondiendo" });
        enviar("respuesta", r.respuesta);
      } catch (e) {
        if (!request.signal.aborted) {
          logger.error("asistente.error", { error: String(e) });
          enviar("error", { error: "error_interno" });
        }
      } finally {
        controller.close();
      }
    },
  });
  const res = new NextResponse(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  res.cookies.set(cookie);
  return res;
}
