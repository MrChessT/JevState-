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
  for (const c of encontrarCantidades(texto)) {
    if (!c.valor.isInteger() || c.valor.lt(0) || c.valor.gt(max)) continue;
    const tras = despues(texto, c.fin, 20);
    const m = re.exec(tras);
    if (!m) continue;
    const fin = c.fin + m[0].length;
    out.push({ n: c.valor.toNumber(), literal: texto.slice(c.inicio, fin), inicio: c.inicio, fin });
  }
  return out;
}

export const extraerDormitorios = (texto: string) => contar(texto, DORMITORIOS, 30);
export const extraerBanos = (texto: string) => contar(texto, BANOS, 20);
export const extraerAseos = (texto: string) => contar(texto, ASEOS, 10);

/** «estudio» o «loft» sin dormitorios separados. */
export function esEstudio(texto: string): boolean {
  return /\b(estudio|loft|studio)\b/.test(plano(texto));
}
