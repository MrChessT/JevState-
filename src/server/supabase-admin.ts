// Cliente con service_role: SOLO para procesos en segundo plano (worker, scripts de carga).
// Nunca se importa desde páginas ni componentes (lo impide la revisión y no lleva NEXT_PUBLIC).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseAdmin(env: Record<string, string | undefined> = process.env): SupabaseClient {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
