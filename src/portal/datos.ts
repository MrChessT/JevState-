import "server-only";
import { cache } from "react";
import type { Filtros } from "./filtros";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";
import { construirRepoFicticio } from "./repo-memoria";
import type { RepositorioPortal } from "./repositorio";
import { repoSupabase } from "./repo-supabase";

let repo: Promise<RepositorioPortal> | null = null;

/** Segundos que se reutiliza la lista completa de publicados (asistente, portada, zonas, sitemap). */
const TODAS_TTL_MS = 60_000;

/**
 * `todas()` la usan el asistente en cada mensaje y varias páginas: con Supabase se cachea en
 * memoria unos segundos (por instancia) para no descargar toda la oferta en cada petición.
 */
function conCacheTodas(r: RepositorioPortal): RepositorioPortal {
  let cache: { hasta: number; datos: ReturnType<RepositorioPortal["todas"]> } | null = null;
  return {
    ...r,
    todas() {
      const ahora = Date.now();
      if (!cache || cache.hasta < ahora) {
        const datos = r.todas();
        cache = { hasta: ahora + TODAS_TTL_MS, datos };
        datos.catch(() => (cache = null));
      }
      return cache.datos;
    },
  };
}

/**
 * Fuente de datos del portal: Supabase (clave anónima + RLS) si está configurado; si no, o con
 * PORTAL_DATOS=ficticios, los 300 inmuebles ficticios en memoria (desarrollo, e2e, demos).
 */
export function portal(): Promise<RepositorioPortal> {
  if (!repo) {
    const env = supabaseEnv();
    repo = env && process.env.PORTAL_DATOS !== "ficticios" ? Promise.resolve(conCacheTodas(repoSupabase(createClient(env.url, env.anonKey, { auth: { persistSession: false } })))) : construirRepoFicticio();
  }
  return repo;
}

export const usaFicticios = () => !supabaseEnv() || process.env.PORTAL_DATOS === "ficticios";

// Deduplicación por petición: generateMetadata y la página piden lo mismo; con React cache la
// consulta se hace una sola vez por render (los argumentos son primitivos para que coincidan).
const buscarPorClave = cache(async (clave: string) => (await portal()).buscar(JSON.parse(clave) as Filtros));
export const buscarUnaVez = (f: Filtros) => buscarPorClave(JSON.stringify(f));
export const fichaUnaVez = cache(async (operacion: "venta" | "alquiler", slug: string) => (await portal()).ficha(operacion, slug));
