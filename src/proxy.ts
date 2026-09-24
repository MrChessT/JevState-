import { NextResponse, type NextRequest } from "next/server";
import { resolverRuta, SEGMENTOS } from "@/i18n/config";
import { refrescarSesion } from "@/lib/supabase/proxy-session";

// Next 16: «proxy» sustituye a «middleware». Dos tareas:
//  1. Rutas localizadas: /venta/… → /es/venta/…, /en/sale/… → /en/venta/…, y redirección a la URL
//     canónica si llega un prefijo o un slug de otro idioma.
//  2. Refresco de la sesión solo en cuenta y backoffice (el resto del portal no toca cookies).
const CON_SESION = new Set<string>([SEGMENTOS.cuenta.es, SEGMENTOS.admin.es]);

export async function proxy(request: NextRequest) {
  const r = resolverRuta(request.nextUrl.pathname);
  if (r.tipo === "redirigir") {
    const url = request.nextUrl.clone();
    url.pathname = r.destino;
    return NextResponse.redirect(url, 308);
  }
  if (r.tipo === "seguir") return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = r.destino;
  const headers = new Headers(request.headers);
  headers.set("x-locale", r.locale);
  const response = NextResponse.rewrite(url, { request: { headers } });
  const seccion = r.destino.split("/")[2];
  return seccion && CON_SESION.has(seccion) ? refrescarSesion(request, response) : response;
}

export const config = {
  // Fuera: API, auth (callback), estáticos, archivos con extensión, sitemap y robots.
  matcher: ["/((?!api/|auth/|ficticios/|_next/|favicon.ico|icon|apple-icon|opengraph-image|sitemap.xml|robots.txt|.*\\.[a-zA-Z0-9]+$).*)"],
};
