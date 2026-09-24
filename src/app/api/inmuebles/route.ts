import { NextResponse, type NextRequest } from "next/server";
import { portal } from "@/portal/datos";

// Resúmenes públicos por referencia (favoritos y comparador sin cuenta).
export async function GET(request: NextRequest) {
  const refs = (request.nextUrl.searchParams.get("refs") ?? "").split(",").map((r) => r.trim()).filter((r) => /^[A-Za-z0-9-]{1,32}$/.test(r)).slice(0, 50);
  if (!refs.length) return NextResponse.json({ items: [] });
  const repo = await portal();
  const todas = await repo.todas();
  const items = refs.map((r) => todas.find((i) => i.ref === r)).filter(Boolean);
  const fichas = request.nextUrl.searchParams.get("fichas") === "1" ? await Promise.all(items.map((i) => repo.ficha(i!.operacion === "venta" ? "venta" : "alquiler", i!.slug))) : null;
  return NextResponse.json({ items: fichas ?? items }, { headers: { "cache-control": "public, max-age=60" } });
}
