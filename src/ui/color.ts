// Contraste WCAG 2.2 para elegir el color de texto sobre el color de marca (configurable).

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Color no válido: ${hex}`);
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((x) => canal(parseInt(x, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

export const BLANCO = "#ffffff";
export const TINTA = "#141414";

/** Texto blanco o casi negro, el que más contraste dé sobre el fondo. */
export function textoSobre(fondo: string): string {
  return contraste(fondo, BLANCO) >= contraste(fondo, TINTA) ? BLANCO : TINTA;
}
