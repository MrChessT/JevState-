import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";
import { construirRepoFicticio } from "./repo-memoria";
import type { RepositorioPortal } from "./repositorio";
import { repoSupabase } from "./repo-supabase";

let repo: Promise<RepositorioPortal> | null = null;

/**
 * Fuente de datos del portal: Supabase (clave anónima + RLS) si está configurado; si no, o con
 * PORTAL_DATOS=ficticios, los 300 inmuebles ficticios en memoria (desarrollo, e2e, demos).
 */
export function portal(): Promise<RepositorioPortal> {
  if (!repo) {
    const env = supabaseEnv();
    repo = env && process.env.PORTAL_DATOS !== "ficticios" ? Promise.resolve(repoSupabase(createClient(env.url, env.anonKey, { auth: { persistSession: false } }))) : construirRepoFicticio();
  }
  return repo;
}

export const usaFicticios = () => !supabaseEnv() || process.env.PORTAL_DATOS === "ficticios";
