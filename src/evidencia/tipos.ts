// Objeto de evidencia (sección 3.2). Determinista: ninguna evidencia sale de un modelo.
import { z } from "zod";
import { sha256 } from "@/jev/stable";
import { SOURCES, type Source } from "@/catalog/schema";

export const Evidencia = z.object({
  id: z.uuid(),
  /** Clave del inmueble (ref) mientras no hay id de base de datos. */
  listingKey: z.string(),
  source: z.enum(SOURCES),
  /** Dónde estaba: clave del feed, ruta JSON-LD, selector, desplazamiento en el texto. */
  path: z.string(),
  /** Literal de la fuente. */
  raw: z.string(),
  /** Campo del catálogo que apoya. */
  campo: z.string(),
  /** Valor normalizado por el código (forma según el tipo del campo; ver ParsedValor). */
  parsed: z.record(z.string(), z.unknown()),
  sourceWeight: z.number().min(0).max(1),
  capturedAt: z.string(),
});
export type Evidencia = z.infer<typeof Evidencia>;

/**
 * Formas de `parsed`:
 *  numérico: { valor: "250000", unidad, contexto?, periodo?, tipo?, alternativas? }
 *  enum/ordinal: { valor: "piso" } o { valores: ["privada", "comunitaria"] } si solo acota
 *  booleano: { valor: true | false }
 *  texto: { valor: "…" }
 */

/** Confianza a priori por fuente: feed estructurado > JSON-LD > tabla > meta > texto (sección 3.2). */
export const PESO_FUENTE: Record<Source, number> = {
  manual: 1,
  feed: 0.95,
  csv: 0.95,
  jsonld: 0.85,
  features_table: 0.8,
  geocode: 0.8,
  meta: 0.65,
  visible_text: 0.5,
};

/** Fuentes estructuradas: sus valores pueden aceptarse en la etapa mini sin Jev. */
export const ESTRUCTURADAS: ReadonlySet<Source> = new Set<Source>(["manual", "feed", "csv", "jsonld"]);

/** Id determinista (formato UUID) para que reprocesar no duplique evidencias. */
export function idEvidencia(listingKey: string, source: string, path: string, raw: string, campo: string): string {
  const h = sha256(`${listingKey}\u0000${source}\u0000${path}\u0000${raw}\u0000${campo}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export function evidencia(e: Omit<Evidencia, "id" | "sourceWeight"> & { sourceWeight?: number }): Evidencia {
  return { ...e, id: idEvidencia(e.listingKey, e.source, e.path, e.raw, e.campo), sourceWeight: e.sourceWeight ?? PESO_FUENTE[e.source] };
}
