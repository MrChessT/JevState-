import { NextResponse, type NextRequest } from "next/server";
import { portal } from "@/portal/datos";

// Resúmenes públicos por referencia (favoritos y comparador sin cuenta).
export async function GET(request: NextRequest) {
  const refs = (request.nextUrl.searchParams.get("refs") ?? "").split(",").map((r) => r.trim()).filter((r) => /^[A-Za-z0-9-]{1,32}$/.test(r)).slice(0, 50);
  if (!refs.length) return NextResponse.json({ items: [] });
  const repo = await portal();
  // Una consulta por referencia (no toda la oferta): favoritos y comparador cargan al instante.
  const items = request.nextUrl.searchParams.get("fichas") === "1" ? await repo.fichasPorRef(refs) : await repo.porRefs(refs);
  return NextResponse.json({ items }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
}
