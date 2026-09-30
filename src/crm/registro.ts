import "server-only";
// Registro de contactos: en Supabase (función registrar_contacto, con service_role, en una
// transacción) o, sin base de datos (demo con ficticios), en memoria del proceso.
import { createHash, randomUUID } from "node:crypto";
import { supabaseEnv } from "@/lib/supabase/env";
import { supabaseAdmin } from "@/server/supabase-admin";
import type { SolicitudContacto } from "./solicitud";

export interface ContactoRegistrado {
  id: string;
  /** true si se guardó en la base de datos; false en la demo sin Supabase. */
  persistente: boolean;
}

/** Versión del texto de consentimiento mostrado (se guarda con cada consentimiento). */
export const TEXTO_CONSENTIMIENTO_VERSION = "contacto-v1";

const hash = (x: string) => createHash("sha256").update(x).digest("hex");

/** Contactos de la demo (sin Supabase): solo para pruebas y demostraciones, se pierden al reiniciar. */
export const CONTACTOS_DEMO: Array<SolicitudContacto & { id: string; creadoEn: string }> = [];

export async function registrarContacto(s: SolicitudContacto, meta: { ip: string; resumen?: string }): Promise<ContactoRegistrado> {
  const sujeto = (s.email || s.telefono || "").toLowerCase().replace(/\s/g, "");
  const payload = {
    tipo: s.tipo,
    ref: s.ref ?? "",
    nombre: s.nombre,
    email: s.email ?? "",
    telefono: s.telefono ?? "",
    mensaje: s.mensaje,
    fecha: s.fecha ?? "",
    franja: s.franja,
    campo: s.campo ?? "",
    consentimiento: s.consentimiento,
    locale: s.locale,
    origen: s.origen,
    resumen: meta.resumen ?? "",
    // Nunca el email ni la IP en claro en el consentimiento: solo su huella.
    sujeto_hash: hash(sujeto),
    ip_hash: hash(`ip:${meta.ip}`),
    texto_version: TEXTO_CONSENTIMIENTO_VERSION,
  };
  const env = supabaseEnv();
  if (env && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.PORTAL_DATOS !== "ficticios") {
    const { data, error } = await supabaseAdmin().rpc("registrar_contacto", { p: payload });
    if (error) throw new Error(`registrar_contacto: ${error.message}`);
    return { id: String(data), persistente: true };
  }
  const id = randomUUID();
  CONTACTOS_DEMO.push({ ...s, id, creadoEn: new Date().toISOString() });
  if (CONTACTOS_DEMO.length > 500) CONTACTOS_DEMO.shift();
  return { id, persistente: false };
}
