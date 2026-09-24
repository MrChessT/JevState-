import { createHash } from "node:crypto";

// Foto ilustrativa de los inmuebles FICTICIOS (SVG determinista, sin red): no son fotos reales.
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const n = new URL(request.url).searchParams.get("n") ?? "1";
  const h = createHash("sha256").update(`${ref}:${n}`).digest();
  const tono = h[0]! % 360;
  const tono2 = (tono + 30 + (h[1]! % 60)) % 360;
  const ventanas = Array.from({ length: 3 + (h[2]! % 4) }, (_, i) => `<rect x="${250 + i * 70}" y="${250 - (h[3 + i]! % 3) * 10}" width="40" height="46" rx="4" fill="hsl(${tono} 30% 92%)" opacity=".9"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" role="img" aria-label="Ilustración de inmueble ficticio">
<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${tono2} 55% 82%)"/><stop offset="1" stop-color="hsl(${tono2} 45% 94%)"/></linearGradient></defs>
<rect width="960" height="640" fill="url(#c)"/><rect y="470" width="960" height="170" fill="hsl(${tono} 20% 70%)"/>
<rect x="210" y="200" width="${200 + (h[8]! % 5) * 70}" height="270" rx="6" fill="hsl(${tono} 35% 45%)"/>${ventanas}
<rect x="${320 + (h[9]! % 3) * 40}" y="380" width="60" height="90" rx="4" fill="hsl(${tono} 25% 25%)"/>
<text x="40" y="600" font-family="system-ui, sans-serif" font-size="30" fill="hsl(${tono} 20% 20%)" opacity=".7">${ref.replace(/[^A-Z0-9-]/gi, "")} · ficticio</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" } });
}
