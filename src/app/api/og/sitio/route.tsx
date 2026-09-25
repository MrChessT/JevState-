import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { TAM_OG, TarjetaOg } from "@/ui/og/tarjeta-og";

// Imagen para compartir del sitio (portada y páginas sin imagen propia).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("lang");
  const d = await diccionario(isLocale(q) ? q : "es");
  return new ImageResponse(<TarjetaOg antetitulo={d.zonas.antetitulo} titulo={d.inicio.titulo} subtitulo={t(d.inicio.subtitulo)} datos={d.asistente.promesas.slice(0, 3)} />, {
    ...TAM_OG,
    headers: { "cache-control": "public, max-age=86400, s-maxage=604800" },
  });
}
