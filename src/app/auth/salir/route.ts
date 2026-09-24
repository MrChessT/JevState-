import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/seguridad/redireccion";

// Cerrar sesión solo por POST (un enlace GET podría dispararse desde otra web).
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = destinoSeguro(String(form.get("next") ?? "/"), "/");
  const supabase = await supabaseServidor();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL(next, request.nextUrl.origin), 303);
}
