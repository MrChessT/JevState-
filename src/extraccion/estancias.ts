import { encontrarCantidades } from "./numeros";
import { despues, plano, type Tramo } from "./texto";

export interface Recuento extends Tramo {
  n: number;
}

const DORMITORIOS = /^\s*(habitaciones|habitacion|habs?\.?|dormitorios?|dorms?\.?|cuartos|alcobas|bedrooms?|beds?\b|hab\b)/;
const BANOS = /^\s*(banos?|baños?|bathrooms?|baths?|wc\b)/;
const ASEOS = /^\s*(aseos?|toilets?)/;

function contar(texto: string, re: RegExp, max: number): Recuento[] {
  const out: Recuento[] = [];
  // «un dormitorio», «una habitación», «un baño»: el artículo es aquí un 1.
  for (const m of plano(texto).matchAll(/\b(un|una|one|a)\s+/g)) {
    const tras = plano(texto).slice(m.index! + m[0].length, m.index! + m[0].length + 20);
    const r = re.exec(` ${tras}`);
    if (r && /^(dormitorio|habitacion|bañ?o|bano|aseo|bedroom|bathroom|toilet)/.test(tras)) out.push({ n: 1, literal: texto.slice(m.index!, m.index! + m[0].length + r[0].length - 1), inicio: m.index!, fin: m.index! + m[0].length + r[0].length - 1 });
  }
  for (const c of encontrarCantidades(texto)) {
    if (!c.valor.isInteger() || c.valor.lt(0) || c.valor.gt(max)) continue;
    const tras = despues(texto, c.fin, 20);
    const m = re.exec(tras);
    if (!m) continue;
    const fin = c.fin + m[0].length;
    out.push({ n: c.valor.toNumber(), literal: texto.slice(c.inicio, fin), inicio: c.inicio, fin });
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

export const extraerDormitorios = (texto: string) => contar(texto, DORMITORIOS, 30);
export const extraerBanos = (texto: string) => contar(texto, BANOS, 20);
export const extraerAseos = (texto: string) => contar(texto, ASEOS, 10);

/** «estudio» o «loft» sin dormitorios separados. */
export function esEstudio(texto: string): boolean {
  return /\b(estudio|loft|studio)\b/.test(plano(texto));
}
