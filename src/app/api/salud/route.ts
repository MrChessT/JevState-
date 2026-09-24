import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ASSISTANT_CATALOG_VERSION } from "@/asistente/version";
import { CATALOG_VERSION } from "@/catalog/index";
import { getRuntime } from "@/server/runtime";

export const dynamic = "force-dynamic";

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
  if (autorizado(request, config.METRICS_TOKEN)) {
    body.jev = { ...(body.jev as object), salud: await jev.health() };
    body.metricas = metrics.snapshot();
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
