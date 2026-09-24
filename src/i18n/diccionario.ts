import { BRAND } from "@/config/brand";
import type { Locale } from "./config";
import es from "./diccionarios/es";

/** Misma forma que el diccionario español, con cualquier texto (el inglés lo cumple por tipo). */
type Forma<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Forma<U>[] : { readonly [K in keyof T]: Forma<T[K]> };
export type Diccionario = Forma<typeof es>;

const CARGADORES: Record<Locale, () => Promise<Diccionario>> = {
  es: async () => es,
  en: async () => (await import("./diccionarios/en")).default,
};

export async function diccionario(locale: Locale): Promise<Diccionario> {
  return CARGADORES[locale]();
}

/** Sustituye {variables}. {marca} siempre está disponible. */
export function t(texto: string, vars: Record<string, string | number> = {}): string {
  const all: Record<string, string | number> = { marca: BRAND.name, ...vars };
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in all ? String(all[k]) : m));
}
