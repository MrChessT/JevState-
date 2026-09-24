// JSON canónico por inmueble (sección 3.3), validado con zod y versionado.
import { z } from "zod";

export const ESTADOS = ["confirmado", "probable", "no_consta", "revisar"] as const;
export const METODOS = ["mini", "verify", "reasoning", "manual"] as const;

export const Adjudicacion = z.object({
  motivo: z.string(),
  motivoConfianza: z.number().min(0).max(1),
  perdedoras: z.array(z.object({ evidenceId: z.string(), valor: z.unknown(), source: z.string() })),
});

export const CampoCanonico = z
  .object({
    /** boolean | string (enum, ordinal, texto, decimal) | number (entero) | null */
    value: z.union([z.boolean(), z.string(), z.number(), z.null()]),
    confidence: z.number().min(0).max(1),
    status: z.enum(ESTADOS),
    evidenceIds: z.array(z.string()),
    method: z.enum(METODOS),
    catalogVersion: z.string(),
    adjudicacion: Adjudicacion.optional(),
    /** Por qué quedó así (para la cola de revisión y la auditoría). */
    nota: z.string().optional(),
  })
  .refine((c) => c.status !== "no_consta" || c.value === null, { message: "no_consta no lleva valor" })
  .refine((c) => c.value === null || c.evidenceIds.length > 0 || c.method === "manual", { message: "todo valor necesita evidencia" });
export type CampoCanonico = z.infer<typeof CampoCanonico>;

export const CANONICO_SCHEMA_VERSION = 1;

export const CanonicoInmueble = z.object({
  schemaVersion: z.literal(CANONICO_SCHEMA_VERSION),
  ref: z.string(),
  catalogVersion: z.string(),
  procesadoEn: z.string(),
  modo: z.enum(["normal", "sin_jev"]),
  campos: z.record(z.string(), CampoCanonico),
});
export type CanonicoInmueble = z.infer<typeof CanonicoInmueble>;

export interface ItemRevision {
  campo: string;
  motivo: "campo_dudoso" | "conflicto";
  propuesto: CampoCanonico["value"];
  confianza: number;
  evidenceIds: string[];
  nota: string;
}
