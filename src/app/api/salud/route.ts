import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ASSISTANT_CATALOG_VERSION } from "@/asistente/version";
import { CATALOG_VERSION } from "@/catalog/index";
import { pruebaAsistente } from "@/asistente/prueba";
import { loadThresholds } from "@/gates/thresholds";
import { portal } from "@/portal/datos";
import { getRuntime } from "@/server/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let diagnosticoCache: { hasta: number; datos: ReturnType<ReturnType<typeof getRuntime>["jev"]["diagnostico"]> } | null = null;

let pruebaAsistenteCache: { hasta: number; datos: Promise<unknown> } | null = null;

function autorizado(request: NextRequest, token: string | undefined): boolean {
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || given.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(token));
}

/**
 * Salud del portal. Público: versión del catálogo y modo de Jev. Con el token de métricas:
 * comprobación real de Jev (latencia) y métricas en memoria.
 */
export async function GET(request: NextRequest) {
  let runtime;
  try {
    runtime = getRuntime();
  } catch (err) {
    // Configuración incompleta: se informa sin exponer valores.
    const detalle = err instanceof Error ? err.message.split("\n")[0] : "configuración no válida";
    return NextResponse.json({ ok: false, error: detalle }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const { config, jev, metrics } = runtime;
  const body: Record<string, unknown> = {
    ok: true,
    catalogo: { datos: CATALOG_VERSION, asistente: ASSISTANT_CATALOG_VERSION },
    jev: { via: config.jev.via, modelo: jev.model },
    supabase: Boolean(config.NEXT_PUBLIC_SUPABASE_URL && config.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
  // Diagnóstico público de Jev (?jev=1): una llamada real mínima, reutilizada 5 minutos, que
  // dice por qué el asistente estaría en modo básico. Nunca muestra claves ni tokens.
  if (request.nextUrl.searchParams.get("jev") === "1") {
    const ahora = Date.now();
    if (!diagnosticoCache || diagnosticoCache.hasta < ahora) {
      diagnosticoCache = { hasta: ahora + 5 * 60_000, datos: jev.diagnostico() };
    }
    let tokenOidc: boolean | null = null;
    if (config.jev.oidc) {
      try {
        const { getVercelOidcTokenSync } = await import("@vercel/oidc");
        tokenOidc = Boolean(getVercelOidcTokenSync());
      } catch {
        tokenOidc = false;
      }
    }
    body.diagnostico = {
      autenticacion: config.jev.via === "fake" ? "sin configurar (Jev simulado: modo básico)" : config.jev.oidc ? "OIDC de Vercel (sin clave guardada)" : "clave en variable de entorno",
      tokenOidcEnLaPeticion: tokenOidc,
      prueba: await diagnosticoCache.datos,
    };
  }
  // Prueba del asistente completo con Jev (?jev=asistente), reutilizada 5 minutos: con la caché de
  // Jev, repetirla no cuesta llamadas nuevas y no sirve para abusar del modelo.
  if (request.nextUrl.searchParams.get("jev") === "asistente") {
    const ahora = Date.now();
    if (jev.model === "jev-fake") {
      body.pruebaAsistente = { ok: false, motivo: "Jev no está configurado: el asistente funciona en modo básico." };
    } else {
      if (!pruebaAsistenteCache || pruebaAsistenteCache.hasta < ahora) {
        pruebaAsistenteCache = { hasta: ahora + 5 * 60_000, datos: portal().then((repo) => pruebaAsistente({ jev, repo, thresholds: loadThresholds() })).catch((err) => ({ ok: false, error: String(err).slice(0, 200) })) };
      }
      body.pruebaAsistente = await pruebaAsistenteCache.datos;
    }
  }
  if (autorizado(request, config.METRICS_TOKEN)) {
    body.jev = { ...(body.jev as object), salud: await jev.health() };
    body.metricas = metrics.snapshot();
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
