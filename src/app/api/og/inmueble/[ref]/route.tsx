import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { portal } from "@/portal/datos";
import { euros, numero } from "@/ui/portal/formato";
import { TAM_OG, TarjetaOg } from "@/ui/og/tarjeta-og";

// Imagen para compartir cada inmueble (WhatsApp, redes, buscadores): precio, título y datos clave.
export async function GET(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const q = request.nextUrl.searchParams.get("lang");
  const lang = isLocale(q) ? q : "es";
  const d = await diccionario(lang);
  const i = (await (await portal()).todas()).find((x) => x.ref === ref);
  if (!i) return new Response("No encontrado", { status: 404 });
  const precio = i.precio ? `${euros(lang, i.precio)}${i.operacion === "venta" ? "" : d.tarjeta.mes}` : undefined;
  const datos = [i.habitaciones ? t(d.tarjeta.hab, { n: i.habitaciones }) : null, i.banos ? t(d.tarjeta.banos, { n: i.banos }) : null, i.superficie ? `${numero(lang, i.superficie)} m²` : null].filter((x): x is string => Boolean(x));
  return new ImageResponse(<TarjetaOg antetitulo={i.operacion === "venta" ? d.nav.comprar : d.nav.alquilar} titulo={i.titulo} subtitulo={`${i.zonaNombre}, ${i.municipioNombre} · Ref. ${i.ref}`} datos={datos} precio={precio} />, {
    ...TAM_OG,
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
