// Ficha de búsqueda (sección 4.5): el foco de la conversación. Visible y editable como chips,
// se hereda entre mensajes con `seguimiento` y se guarda con la sesión.
import { z } from "zod";

export const NIVEL_REQUISITO = ["imprescindible", "deseable", "rechazo"] as const;
export const NIVEL_PROXIMIDAD = ["muy_cerca", "cerca"] as const;

export const FichaBusqueda = z.object({
  operacion: z.enum(["venta", "alquiler"]).optional(),
  zonas: z.array(z.string()).default([]),
  /** Zonas añadidas por ampliación (se avisa al usuario). */
  zonasAmpliadas: z.array(z.string()).default([]),
  precioMax: z.number().positive().optional(),
  precioMin: z.number().positive().optional(),
  /** Tolerancia sobre el máximo en % (5 por defecto; la relajación la sube a 10). */
  tolerancia: z.number().min(0).max(30).default(5),
  tipos: z.array(z.string()).default([]),
  habMin: z.number().int().min(0).max(10).optional(),
  requisitos: z.record(z.string(), z.enum(NIVEL_REQUISITO)).default({}),
  proximidad: z.record(z.string(), z.enum(NIVEL_PROXIMIDAD)).default({}),
  prioridad: z.string().optional(),
  /** Solo si el usuario lo declara (sección 4.2). */
  perfil: z.string().optional(),
  /** Pesos aprendidos del feedback («muy oscuro» → luminosidad). */
  pesos: z.record(z.string(), z.number()).default({}),
  /** Inmuebles descartados con «no me encaja». */
  descartados: z.array(z.string()).default([]),
  /** Texto libre de motivos para el encaje (llamada 2). */
  necesidades: z.string().max(600).optional(),
});
export type FichaBusqueda = z.infer<typeof FichaBusqueda>;

export const fichaVacia = (): FichaBusqueda => FichaBusqueda.parse({});

export function fichaTieneCriterios(f: FichaBusqueda): boolean {
  return Boolean(f.zonas.length || f.precioMax || f.precioMin || f.tipos.length || f.habMin !== undefined || Object.keys(f.requisitos).length);
}

/** Hereda de la ficha anterior lo que el mensaje no dice (seguimiento). */
export function heredar(anterior: FichaBusqueda, nueva: Partial<FichaBusqueda>): FichaBusqueda {
  return FichaBusqueda.parse({
    ...anterior,
    ...Object.fromEntries(Object.entries(nueva).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))),
    requisitos: { ...anterior.requisitos, ...(nueva.requisitos ?? {}) },
    proximidad: { ...anterior.proximidad, ...(nueva.proximidad ?? {}) },
    pesos: { ...anterior.pesos, ...(nueva.pesos ?? {}) },
    descartados: [...new Set([...anterior.descartados, ...(nueva.descartados ?? [])])],
    necesidades: [anterior.necesidades, nueva.necesidades].filter(Boolean).join(" · ").slice(-600) || undefined,
  });
}

/** Chip editable de la ficha (la UI los muestra y permite quitarlos). */
export interface Chip {
  clave: string;
  texto: string;
  dudoso?: boolean;
}
