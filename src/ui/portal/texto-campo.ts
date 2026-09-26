import { campo as campoCatalogo } from "@/catalog/publico";
import type { Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import type { CampoCanonico } from "@/sde/cascada/canonico";
import { euros, numero } from "./formato";

/** Valor legible de un campo; null si no consta. */
export function textoCampo(id: string, c: CampoCanonico | undefined, locale: Locale, d: Diccionario): string | null {
  if (!c || c.value === null || c.status === "no_consta") return null;
  const f = campoCatalogo(id);
  const v = c.value;
  if (typeof v === "boolean") return v ? d.valores.si : d.valores.no;
  if (f?.type === "currency") return `${euros(locale, Number(v))}${f.unit === "EUR/mes" ? d.tarjeta.mes : f.unit === "EUR/año" ? (locale === "es" ? "/año" : "/year") : ""}`;
  if (f?.type === "area") return `${numero(locale, Number(v))} m²`;
  if (f?.type === "decimal") return `${v}${f.unit === "%" ? " %" : ""}`;
  if (id === "planta") return Number(v) === 0 ? d.valores.bajo : `${v}ª`;
  if (id === "certificado_energetico" && /^[a-g]$/.test(String(v))) return String(v).toUpperCase();
  if (id === "tipo") return d.tipos[String(v) as keyof typeof d.tipos] ?? String(v);
  if (id === "zona" || id === "direccion") return null;
  return d.valores[String(v) as keyof typeof d.valores] ?? String(v);
}
