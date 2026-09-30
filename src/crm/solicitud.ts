// Solicitud de contacto o de visita (fase 5). La valida el servidor; la interfaz usa el mismo
// esquema para mostrar los errores. Sin consentimiento o sin un medio de contacto no se guarda.
import { z } from "zod";

export const FRANJAS = ["manana", "tarde", "indiferente"] as const;
export type Franja = (typeof FRANJAS)[number];

export const TIPOS_SOLICITUD = ["contacto", "visita", "pregunta_no_consta"] as const;

const texto = (max: number) => z.string().trim().max(max);

export const SolicitudContacto = z
  .object({
    tipo: z.enum(TIPOS_SOLICITUD).default("contacto"),
    ref: z.string().regex(/^[A-Za-z0-9-]{1,32}$/).optional(),
    nombre: texto(80).min(2),
    email: z.union([z.email().max(160), z.literal("")]).optional(),
    telefono: z
      .union([z.string().trim().regex(/^\+?[\d\s().-]{9,20}$/), z.literal("")])
      .optional(),
    mensaje: texto(1500).default(""),
    fecha: z.union([z.iso.date(), z.literal("")]).optional(),
    franja: z.enum(FRANJAS).default("indiferente"),
    /** Dato que no consta en la ficha y se pregunta al agente. */
    campo: z.string().regex(/^[a-z_,]{1,300}$/).optional(),
    consentimiento: z.literal(true),
    locale: z.enum(["es", "en"]).default("es"),
    origen: z.enum(["formulario", "asistente"]).default("formulario"),
    /** Campo trampa para bots: una persona nunca lo rellena (está oculto). */
    web: z.string().max(0).optional(),
  })
  .refine((s) => Boolean(s.email || s.telefono), { message: "contacto_requerido", path: ["email"] });

export type SolicitudContacto = z.infer<typeof SolicitudContacto>;

/** Fecha mínima para pedir visita: mañana (hora de Madrid). */
export function fechaMinima(ahora = new Date()): string {
  const madrid = new Date(ahora.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  madrid.setDate(madrid.getDate() + 1);
  return `${madrid.getFullYear()}-${String(madrid.getMonth() + 1).padStart(2, "0")}-${String(madrid.getDate()).padStart(2, "0")}`;
}

const DIAS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

/**
 * Fecha y franja que el usuario menciona al pedir una visita («el sábado por la tarde»,
 * «mañana por la mañana»). Solo propone: la persona las revisa en el formulario antes de enviar.
 */
export function preferenciaVisita(mensaje: string, ahora = new Date()): { fecha: string | null; franja: Franja } {
  const p = mensaje.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const franja: Franja = /\b(por la tarde|tarde|afternoon|evening)\b/.test(p) ? "tarde" : /\bpor la manana\b|\bmorning\b|\ba primera hora\b/.test(p) ? "manana" : "indiferente";
  const hoy = new Date(ahora.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (/\bpasado manana\b/.test(p)) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + 2);
    return { fecha: iso(d), franja };
  }
  // «mañana» como día (no «por la mañana»).
  if (/\bmanana\b/.test(p.replace(/por la manana/g, "")) || /\btomorrow\b/.test(p)) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + 1);
    return { fecha: iso(d), franja };
  }
  for (const [nombre, dia] of Object.entries(DIAS)) {
    if (new RegExp(`\\b${nombre}\\b`).test(p)) {
      const d = new Date(hoy);
      const delta = (dia - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      return { fecha: iso(d), franja };
    }
  }
  return { fecha: null, franja };
}
