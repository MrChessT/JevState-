import { createHash } from "node:crypto";

// Foto ilustrativa de los inmuebles FICTICIOS (SVG determinista, sin red): no son fotos reales y
// lo dicen en la propia imagen. Fachada mediterránea con paleta cálida; cada ref y cada número de
// foto (?n=) dan una variación distinta (plantas, huecos, colores, hora del día).

const FACHADAS = [
  { muro: "#efe4d2", sombra: "#dccbb1", carpinteria: "#2f5d62", toldo: "#c8553d" },
  { muro: "#f4efe6", sombra: "#e0d6c5", carpinteria: "#6b4f3a", toldo: "#3d6b8c" },
  { muro: "#e9cfae", sombra: "#d4b58f", carpinteria: "#3e4b3a", toldo: "#b5452f" },
  { muro: "#dfe3da", sombra: "#c7cdc0", carpinteria: "#48586b", toldo: "#d08b2c" },
  { muro: "#f1dccb", sombra: "#dcc0a9", carpinteria: "#29454f", toldo: "#6f8f5b" },
  { muro: "#ece8e1", sombra: "#d5cfc5", carpinteria: "#7a3e2c", toldo: "#2f6f73" },
];

const CIELOS = [
  ["#bcd9ea", "#eef5f7"],
  ["#f6d7b7", "#fcefe2"],
  ["#c9d8f0", "#f1f4fb"],
  ["#d6e6dc", "#f4f8f2"],
];

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const n = new URL(request.url).searchParams.get("n") ?? "1";
  const h = createHash("sha256").update(`${ref}:${n}`).digest();
  const f = FACHADAS[h[0]! % FACHADAS.length]!;
  const [cieloA, cieloB] = CIELOS[h[1]! % CIELOS.length]!;
  const plantas = 2 + (h[2]! % 4); // 2..5
  const columnas = 3 + (h[3]! % 3); // 3..5
  const hueco = 78;
  const ancho = columnas * hueco + 80;
  const alto = plantas * 92 + 40;
  const x0 = 480 - ancho / 2 + ((h[4]! % 5) - 2) * 30;
  const suelo = 540;
  const y0 = suelo - alto;
  const sol = { x: 140 + (h[5]! % 6) * 110, y: 90 + (h[6]! % 3) * 20 };

  let huecos = "";
  for (let p = 0; p < plantas; p++) {
    const y = y0 + 40 + p * 92;
    const bajo = p === plantas - 1;
    for (let c = 0; c < columnas; c++) {
      const x = x0 + 40 + c * hueco + 14;
      const k = h[(7 + p * columnas + c) % 32]!;
      if (bajo && c === Math.floor(columnas / 2)) {
        huecos += `<rect x="${x - 2}" y="${y - 6}" width="54" height="${suelo - y + 6}" rx="26" fill="${f.carpinteria}"/><rect x="${x + 4}" y="${y + 8}" width="42" height="${suelo - y - 8}" rx="20" fill="#1f2a2c" opacity=".55"/>`;
        continue;
      }
      const persiana = 8 + (k % 4) * 9;
      huecos += `<rect x="${x}" y="${y}" width="50" height="62" rx="3" fill="#2a3a40" opacity=".78"/>`;
      huecos += `<rect x="${x}" y="${y}" width="50" height="${persiana}" fill="${f.carpinteria}" opacity=".85"/>`;
      huecos += `<rect x="${x + 24}" y="${y + persiana}" width="2" height="${62 - persiana}" fill="${f.muro}" opacity=".5"/>`;
      if (!bajo && k % 3 !== 0) {
        const barrotes = [1, 2, 3, 4, 5].map((i) => `M${x - 6 + i * 10.3} ${y + 42}v18`).join("");
        huecos += `<rect x="${x - 8}" y="${y + 60}" width="66" height="5" fill="${f.sombra}"/><path d="M${x - 6} ${y + 42}h62M${x - 6} ${y + 42}v18M${x + 56} ${y + 42}v18${barrotes}" stroke="${f.carpinteria}" stroke-width="2" fill="none"/>`;
        if (k % 5 === 0) huecos += `<circle cx="${x + 46}" cy="${y + 36}" r="9" fill="#5f8a4e"/><circle cx="${x + 38}" cy="${y + 39}" r="6" fill="#77a35f"/>`;
      }
      if (p === 0 && k % 4 === 1) huecos += `<path d="M${x - 6} ${y - 4}h62l-8 16h-46z" fill="${f.toldo}"/>`;
    }
  }

  const palmera = h[20]! % 2 === 0;
  const px = x0 + ancho + 50 > 900 ? x0 - 70 : x0 + ancho + 50;
  const arbol = palmera
    ? `<path d="M${px} ${suelo} C ${px + 6} ${suelo - 90}, ${px - 4} ${suelo - 170}, ${px + 8} ${suelo - 230}" stroke="#7a5b3f" stroke-width="10" fill="none" stroke-linecap="round"/><g fill="#4f7a45">${[-150, -110, -60, -20, 20]
        .map((a) => `<ellipse cx="${px + 8}" cy="${suelo - 232}" rx="70" ry="12" transform="rotate(${a} ${px + 8} ${suelo - 232}) translate(52 0)"/>`)
        .join("")}</g>`
    : `<rect x="${px - 5}" y="${suelo - 90}" width="10" height="90" fill="#7a5b3f"/><circle cx="${px}" cy="${suelo - 120}" r="48" fill="#5d8a4f"/><circle cx="${px - 26}" cy="${suelo - 100}" r="32" fill="#6c9a5a"/><circle cx="${px + 28}" cy="${suelo - 104}" r="30" fill="#4f7a45"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" role="img" aria-label="Ilustración de un inmueble ficticio">
<defs>
<linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cieloA}"/><stop offset="1" stop-color="${cieloB}"/></linearGradient>
<linearGradient id="muro" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${f.muro}"/><stop offset="1" stop-color="${f.sombra}"/></linearGradient>
<radialGradient id="sol"><stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient>
</defs>
<rect width="960" height="640" fill="url(#cielo)"/>
<circle cx="${sol.x}" cy="${sol.y}" r="120" fill="url(#sol)"/><circle cx="${sol.x}" cy="${sol.y}" r="34" fill="#fff4cf"/>
<path d="M0 ${suelo - 70} Q 160 ${suelo - 150} 320 ${suelo - 90} T 640 ${suelo - 110} T 960 ${suelo - 80} V ${suelo} H0z" fill="#b9c7b0" opacity=".55"/>
<path d="M0 ${suelo - 30} Q 200 ${suelo - 80} 420 ${suelo - 40} T 960 ${suelo - 50} V ${suelo} H0z" fill="#a3b596" opacity=".5"/>
<ellipse cx="${x0 + ancho / 2 + 40}" cy="${suelo + 6}" rx="${ancho / 2 + 60}" ry="16" fill="#000" opacity=".12"/>
<rect x="${x0}" y="${y0}" width="${ancho}" height="${alto}" fill="url(#muro)"/>
<rect x="${x0 - 8}" y="${y0 - 14}" width="${ancho + 16}" height="18" fill="${f.sombra}"/>
<rect x="${x0}" y="${suelo - 26}" width="${ancho}" height="26" fill="${f.sombra}" opacity=".7"/>
${huecos}
${arbol}
<rect y="${suelo}" width="960" height="${640 - suelo}" fill="#d9d2c5"/>
<rect y="${suelo}" width="960" height="10" fill="#c9c0b0"/>
<rect x="24" y="590" width="190" height="30" rx="15" fill="#000" opacity=".35"/>
<text x="119" y="610" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" fill="#fff">${ref.replace(/[^A-Z0-9-]/gi, "")} · ilustración</text>
</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
