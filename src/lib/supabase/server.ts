import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Cliente con el JWT del usuario (RLS decide qué ve). Devuelve null si Supabase no está configurado,
 * para que el portal no se caiga en desarrollo sin base de datos.
 */
export async function supabaseServidor(): Promise<SupabaseClient | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Los Server Components no siempre pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

export interface Membresia {
  agency_id: string;
  agent_id: string;
  role: "admin" | "agente" | "editor";
  display_name: string;
}

/** Usuario actual (verificado) y sus membresías en agencias. */
export async function sesion(): Promise<{ userId: string; email: string | null; membresias: Membresia[] } | null> {
  // Siempre por petición, aunque en el build no haya Supabase configurado.
  await connection();
  const supabase = await supabaseServidor();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: membresias } = await supabase.rpc("mis_membresias");
  return { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : null, membresias: (membresias ?? []) as Membresia[] };
}
