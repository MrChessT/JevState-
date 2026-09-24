import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { leerFiltros, urlFiltros } from "@/portal/filtros";

// Formulario de búsqueda sin JavaScript: GET con los campos → 303 a la URL canónica.
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const lang = isLocale(q.get("lang")) ? (q.get("lang") as "es" | "en") : "es";
  const operacion = q.get("operacion") === "alquiler" ? "alquiler" : "venta";
  const municipio = q.get("zona") ?? "";
  const barrio = q.get("barrio") ?? "";
  // Si el usuario no cambió el municipio, se conserva el barrio en el que estaba.
  const zona = barrio && barrio.split("/")[0] === municipio ? barrio.split("/") : municipio ? [municipio] : undefined;
  const params: Record<string, string> = {};
  for (const k of ["precio_min", "precio_max", "hab_min", "banos_min", "m2_min", "orden"]) if (q.get(k)) params[k] = q.get(k)!;
  const tipos = q.getAll("tipo").filter(Boolean);
  const con = q.getAll("con").filter(Boolean);
  if (tipos.length) params.tipo = tipos.join(",");
  if (con.length) params.con = con.join(",");
  const f = leerFiltros(operacion, zona?.filter((x) => /^[a-z0-9-]+$/.test(x)), params);
  return NextResponse.redirect(new URL(urlFiltros(lang, f), request.nextUrl.origin), 303);
}
