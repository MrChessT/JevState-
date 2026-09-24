import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Refresca la sesión de Supabase (cookies) en las rutas que la usan. Las páginas públicas no pasan
 * por aquí: así siguen siendo cacheables y no hay una verificación de JWT por cada visita.
 */
export async function refrescarSesion(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const env = supabaseEnv();
  if (!env) return response;
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  // getClaims verifica la firma del JWT (JWKS en caché) y renueva el token si ha caducado.
  await supabase.auth.getClaims();
  return response;
}
