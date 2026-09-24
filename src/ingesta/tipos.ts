// Contrato común de las fuentes (sección 3.1): cada adaptador produce RegistroFuente; la lógica de
// negocio no sabe de qué formato vino.
import { z } from "zod";
import { stableHash } from "@/jev/stable";

export const LOCALES_TEXTO = ["es", "en", "de", "fr", "nl"] as const;

export const RegistroFuente = z.object({
  fuente: z.enum(["feed", "csv", "manual"]),
  /** Código del adaptador (data_sources.code). */
  adaptador: z.string(),
  sourceId: z.string().min(1),
  ref: z.string().regex(/^[A-Za-z0-9-]{1,32}$/),
  /** Pares literales ruta → valor tal como vienen en la fuente («price», «features/feature[2]»). */
  campos: z.record(z.string(), z.string()),
  titulo: z.partialRecord(z.enum(LOCALES_TEXTO), z.string()).default({}),
  descripcion: z.partialRecord(z.enum(LOCALES_TEXTO), z.string()).default({}),
  /** Página web del anuncio, si la fuente la aporta (JSON-LD, meta, tabla de características). */
  html: z.string().optional(),
  imagenes: z.array(z.object({ url: z.url(), titulo: z.string().optional() })).default([]),
  coordenadas: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
  capturadoEn: z.string(),
  /** Marcado de datos de desarrollo: nunca se mezclan con reales. */
  ficticio: z.boolean().default(false),
});
export type RegistroFuente = z.infer<typeof RegistroFuente>;

/** Hash de contenido (sin la fecha de captura): si no cambia, no se reprocesa. */
export function hashContenido(r: Omit<RegistroFuente, "capturadoEn"> & { capturadoEn?: string }): string {
  const resto: Record<string, unknown> = { ...r };
  delete resto.capturadoEn;
  return stableHash(resto);
}

export interface AdaptadorFuente {
  codigo: string;
  /** Solo se procesan fuentes con permiso, licencia o datos abiertos. */
  legalOk: boolean;
  baseLegal: string;
  leer(): AsyncIterable<RegistroFuente>;
}

export class FuenteSinBaseLegal extends Error {
  constructor(codigo: string) {
    super(`La fuente «${codigo}» no tiene base legal (legal_ok = false): no se procesa`);
    this.name = "FuenteSinBaseLegal";
  }
}

/** Lee una fuente comprobando la base legal y validando cada registro con zod. */
export async function* leerFuente(a: AdaptadorFuente): AsyncIterable<{ ok: true; registro: RegistroFuente; hash: string } | { ok: false; error: string; indice: number }> {
  if (!a.legalOk) throw new FuenteSinBaseLegal(a.codigo);
  let i = 0;
  for await (const bruto of a.leer()) {
    const r = RegistroFuente.safeParse(bruto);
    if (r.success) yield { ok: true, registro: r.data, hash: hashContenido(r.data) };
    else yield { ok: false, error: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "), indice: i };
    i++;
  }
}
