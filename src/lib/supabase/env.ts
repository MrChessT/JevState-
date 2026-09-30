/**
 * URL base del proyecto de Supabase. Se queda solo con el origen: el panel de Supabase muestra
 * a veces la URL de la API REST (`…supabase.co/rest/v1/`) y, pegada tal cual, rompe el login
 * (las peticiones van a `/rest/v1/auth/v1/…` → 404).
 */
export function urlSupabase(url: string): string {
  try {
    return new URL(url.trim()).origin;
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

/** Variables públicas de Supabase, o null si el entorno no lo tiene configurado (desarrollo sin BD). */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url: urlSupabase(url), anonKey } : null;
}
