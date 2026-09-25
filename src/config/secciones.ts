import type { Segmento } from "@/i18n/config";

/**
 * Secciones públicas ya construidas. La navegación, el sitemap y los CTA solo enlazan a estas:
 * nunca hay enlaces a páginas que aún no existen. Cada fase añade las suyas.
 */
export const SECCIONES_PUBLICADAS: ReadonlySet<Segmento> = new Set<Segmento>(["cuenta", "legal", "venta", "alquiler", "zonas", "agencia", "favoritos", "comparar", "asistente"]);

export const publicada = (s: Segmento) => SECCIONES_PUBLICADAS.has(s);

/** El portal no se indexa hasta que haya contenido real (fase 2). */
export const INDEXABLE = process.env.NEXT_PUBLIC_INDEXABLE === "true";
