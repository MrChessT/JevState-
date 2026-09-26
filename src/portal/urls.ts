// URL pública de una ficha. Módulo sin dependencias (se usa también en el navegador).
import { ruta, type Locale } from "@/i18n/config";

export function urlFicha(locale: Locale, i: { operacion: string; zonaPath: string; slug: string }): string {
  const op = i.operacion === "venta" ? "venta" : "alquiler";
  return ruta(locale, op, ...i.zonaPath.split("/"), i.slug);
}
