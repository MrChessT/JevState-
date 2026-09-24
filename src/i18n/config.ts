// Idiomas y rutas localizadas (sección 2.1). Español sin prefijo (URL canónica: /venta/murcia/…),
// el resto con prefijo (/en/sale/murcia/…). Añadir de, fr o nl = añadir el código aquí, su
// diccionario (traducción hecha por personas) y sus segmentos en SEGMENTOS.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** Idiomas preparados en la arquitectura pero sin traducción humana todavía (no se publican). */
export const PLANNED_LOCALES = ["de", "fr", "nl"] as const;

export function isLocale(value: string | undefined | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

/** Nombre de cada idioma en su propio idioma (selector). */
export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", en: "English" };

/** Etiqueta BCP 47 para Intl, hreflang y Open Graph. */
export const LOCALE_TAGS: Record<Locale, { intl: string; og: string }> = {
  es: { intl: "es-ES", og: "es_ES" },
  en: { intl: "en-GB", og: "en_GB" },
};

/**
 * Primer segmento de las rutas públicas: nombre interno (carpeta de app/[lang]) → slug por idioma.
 * El proxy traduce el slug público al interno; los enlaces se construyen con `ruta()`.
 */
export const SEGMENTOS = {
  venta: { es: "venta", en: "sale" },
  alquiler: { es: "alquiler", en: "rent" },
  zonas: { es: "zonas", en: "areas" },
  asistente: { es: "asistente", en: "assistant" },
  valorar: { es: "valorar-mi-vivienda", en: "value-my-home" },
  agencia: { es: "agencia", en: "about-us" },
  contacto: { es: "contacto", en: "contact" },
  favoritos: { es: "favoritos", en: "favourites" },
  comparar: { es: "comparar", en: "compare" },
  cuenta: { es: "cuenta", en: "account" },
  entrar: { es: "entrar", en: "sign-in" },
  legal: { es: "legal", en: "legal" },
  "aviso-legal": { es: "aviso-legal", en: "legal-notice" },
  privacidad: { es: "privacidad", en: "privacy" },
  cookies: { es: "cookies", en: "cookies" },
  admin: { es: "admin", en: "admin" },
  estilo: { es: "estilo", en: "style" },
} as const satisfies Record<string, Record<Locale, string>>;
export type Segmento = keyof typeof SEGMENTOS;

const PUBLICO_A_INTERNO: Record<Locale, Map<string, Segmento>> = Object.fromEntries(
  LOCALES.map((locale) => [locale, new Map(Object.entries(SEGMENTOS).map(([interno, slugs]) => [slugs[locale], interno as Segmento]))]),
) as Record<Locale, Map<string, Segmento>>;

/** Secciones cuyo segundo segmento también se traduce (/cuenta/entrar, /legal/privacidad). */
const CON_SUBSECCION = new Set<Segmento>(["cuenta", "legal"]);

/** ¿Se traduce el segmento en la posición i, dado el primer segmento interno? */
function traducible(i: number, primero: Segmento | undefined): boolean {
  return i === 0 || (i === 1 && primero !== undefined && CON_SUBSECCION.has(primero));
}

/** Construye una URL pública: ruta("en", "valorar") → "/en/value-my-home". */
export function ruta(locale: Locale, ...partes: Array<Segmento | string>): string {
  const primero = partes[0] as Segmento | undefined;
  const traducidas = partes.map((p, i) => {
    const seg = SEGMENTOS[p as Segmento];
    // Solo se traducen las secciones; zonas y slugs de inmueble van tal cual.
    return seg && traducible(i, primero) ? seg[locale] : encodeURIComponent(p);
  });
  const path = traducidas.length ? `/${traducidas.join("/")}` : "";
  return locale === DEFAULT_LOCALE ? path || "/" : `/${locale}${path}`;
}

export type Resolucion =
  | { tipo: "reescribir"; destino: string; locale: Locale }
  | { tipo: "redirigir"; destino: string }
  | { tipo: "seguir"; locale: Locale };

/**
 * Traduce una ruta pública a la interna (app/[lang]/…):
 *   /                → reescribe a /es
 *   /venta/murcia    → reescribe a /es/venta/murcia
 *   /en/sale/murcia  → reescribe a /en/venta/murcia
 *   /es/venta        → redirige a /venta (una sola URL canónica por página)
 *   /en/venta        → redirige a /en/sale
 */
export function resolverRuta(pathname: string): Resolucion {
  const partes = pathname.split("/").filter(Boolean).map(safeDecode);
  let locale: Locale = DEFAULT_LOCALE;
  let segmentos = partes;
  if (isLocale(partes[0])) {
    if (partes[0] === DEFAULT_LOCALE) {
      const resto = partes.slice(1).map(encodeURIComponent).join("/");
      return { tipo: "redirigir", destino: `/${resto}` };
    }
    locale = partes[0];
    segmentos = partes.slice(1);
  }
  const internos: string[] = [];
  let canonica = true;
  let primero: Segmento | undefined;
  segmentos.forEach((seg, i) => {
    if (!traducible(i, primero)) {
      internos.push(seg);
      return;
    }
    const propio = PUBLICO_A_INTERNO[locale].get(seg);
    const deOtro = propio ?? LOCALES.map((l) => PUBLICO_A_INTERNO[l].get(seg)).find((x) => x !== undefined);
    if (!propio && deOtro) canonica = false;
    const interno = propio ?? deOtro;
    if (i === 0) primero = interno;
    internos.push(interno ?? seg);
  });
  if (!canonica) return { tipo: "redirigir", destino: ruta(locale, ...internos) };
  return { tipo: "reescribir", destino: `/${locale}${internos.length ? `/${internos.map(encodeURIComponent).join("/")}` : ""}`, locale };
}

function safeDecode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** Alternativas hreflang de una página (para metadata y sitemap). */
export function alternativas(siteUrl: string, ...partes: Array<Segmento | string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of LOCALES) out[LOCALE_TAGS[locale].intl] = `${siteUrl}${ruta(locale, ...partes)}`;
  out["x-default"] = `${siteUrl}${ruta(DEFAULT_LOCALE, ...partes)}`;
  return out;
}
