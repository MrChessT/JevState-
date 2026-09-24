import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/seguridad/redireccion";

// Vuelta del magic link: intercambia el código por la sesión y vuelve a una ruta interna.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = destinoSeguro(searchParams.get("next"), "/cuenta");
  const code = searchParams.get("code");
  const supabase = await supabaseServidor();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const entrar = next.startsWith("/en/") ? "/en/account/sign-in" : "/cuenta/entrar";
  return NextResponse.redirect(new URL(`${entrar}?error=enlace`, origin));
}
