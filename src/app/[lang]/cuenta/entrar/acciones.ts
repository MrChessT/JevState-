"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { BRAND } from "@/config/brand";
import { isLocale, ruta } from "@/i18n/config";
import { supabaseServidor } from "@/lib/supabase/server";
import { logger } from "@/observability/logger";

export type EstadoEnlace = { estado: "inicial" | "enviado" | "email_no_valido" | "error" | "no_configurada" };

const Entrada = z.object({ email: z.email().max(254), lang: z.string() });

/**
 * Envía el magic link. Siempre responde «enviado» si el email es válido, exista o no la cuenta
 * (no se revela quién tiene cuenta). Supabase limita la frecuencia de envíos.
 */
export async function enviarEnlace(_prev: EstadoEnlace, form: FormData): Promise<EstadoEnlace> {
  const parsed = Entrada.safeParse({ email: String(form.get("email") ?? "").trim(), lang: String(form.get("lang") ?? "es") });
  if (!parsed.success) return { estado: "email_no_valido" };
  const lang = isLocale(parsed.data.lang) ? parsed.data.lang : "es";
  const supabase = await supabaseServidor();
  if (!supabase) return { estado: "no_configurada" };
  const h = await headers();
  const origen = h.get("origin") ?? BRAND.siteUrl;
  const next = ruta(lang, "cuenta");
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origen}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) {
    logger.warn("cuenta.enlace_error", { status: error.status, code: error.code });
    // Límite de frecuencia u otro fallo: no se revela nada del email.
    return { estado: error.status === 429 ? "enviado" : "error" };
  }
  return { estado: "enviado" };
}
