// Números escritos en español (y en inglés cuando no hay ambigüedad): cifras con separadores,
// multiplicadores (k, mil, M, millones) y números en palabras («doscientos cincuenta mil»).
// Todo con decimal.js: nunca se calcula un importe con `number`.
import Decimal from "decimal.js";
import { plano, type Tramo } from "./texto";

export interface Cantidad extends Tramo {
  valor: Decimal;
  /**
   * Interpretaciones alternativas cuando la escritura es ambigua («1,500» puede ser 1,5 o 1500;
   * «250» en un presupuesto puede ser 250 o 250 mil). El código no elige: las ofrece como candidatas.
   */
  alternativas: Decimal[];
  /** Escrito con palabras («doscientos mil»). */
  enPalabras: boolean;
}

// Cifras ---------------------------------------------------------------------------

/**
 * Interpreta una cifra con separadores. Reglas (español primero):
 *  - con «.» y «,»: el último separador es el decimal («1.250,50», «1,250.50»);
 *  - solo «.»: grupos de 3 → miles («250.000»); si no, decimal («1.5»);
 *  - solo «,»: varios grupos de 3 → miles («1,250,000»); un grupo de 3 → AMBIGUO («1,500»);
 *    otro caso → decimal («85,5»).
 */
export function parseCifra(token: string): { valor: Decimal; alternativa?: Decimal } | null {
  const t = token.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(t) || /[.,]{2}/.test(t) || /[.,]$/.test(t)) return null;
  const puntos = (t.match(/\./g) ?? []).length;
  const comas = (t.match(/,/g) ?? []).length;
  const d = (s: string) => new Decimal(s);
  if (puntos && comas) {
    const decimalEsComa = t.lastIndexOf(",") > t.lastIndexOf(".");
    const [miles, dec] = decimalEsComa ? [".", ","] : [",", "."];
    if ((t.split(dec).length - 1) !== 1) return null;
    const [ent, frac] = t.split(dec) as [string, string];
    if (!gruposDeMiles(ent, miles)) return null;
    return { valor: d(`${ent.split(miles).join("")}.${frac}`) };
  }
  if (puntos) {
    if (gruposDeMiles(t, ".") && puntos >= 1 && t.split(".").slice(1).every((g) => g.length === 3)) return { valor: d(t.replace(/\./g, "")) };
    return puntos === 1 ? { valor: d(t) } : null;
  }
  if (comas) {
    const grupos = t.split(",");
    if (comas >= 2) return gruposDeMiles(t, ",") ? { valor: d(t.replace(/,/g, "")) } : null;
    if (grupos[1]!.length === 3 && grupos[0]!.length <= 3 && grupos[0] !== "0") {
      return { valor: d(t.replace(",", ".")), alternativa: d(t.replace(",", "")) };
    }
    return { valor: d(t.replace(",", ".")) };
  }
  return { valor: d(t) };
}

function gruposDeMiles(t: string, sep: string): boolean {
  const g = t.split(sep);
  return g[0]!.length >= 1 && g[0]!.length <= 3 && g.slice(1).every((x) => x.length === 3);
}

// Palabras ---------------------------------------------------------------------------

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
  // Inglés, solo lo básico para mensajes («three bedrooms»).
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const MIL = new Set(["mil"]);
const MILLON = new Set(["millon", "millones"]);
const PALABRA_NUMERICA = new Set([...Object.keys(UNIDADES), "y", "mil", "millon", "millones", "medio"]);

/** «doscientos cincuenta mil» → 250000; «un millón doscientos mil» → 1200000; «medio millón» → 500000. */
export function parsePalabras(frase: string): number | null {
  const palabras = plano(frase).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return null;
  let total = 0;
  let actual = 0;
  let alguno = false;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i]!;
    if (p === "y") {
      if (!alguno || i === palabras.length - 1) return null;
      continue;
    }
    if (p === "medio" && MILLON.has(palabras[i + 1] ?? "")) {
      total += 500_000;
      i++;
      alguno = true;
      continue;
    }
    if (p in UNIDADES) {
      actual += UNIDADES[p]!;
      alguno = true;
    } else if (MIL.has(p)) {
      total += (actual || 1) * 1000;
      actual = 0;
      alguno = true;
    } else if (MILLON.has(p)) {
      total = (total + (actual || 1)) * 1_000_000;
      actual = 0;
      alguno = true;
    } else return null;
  }
  return alguno ? total + actual : null;
}

// Búsqueda en texto -----------------------------------------------------------------------

// Cifra + multiplicador opcional: «250.000», «250k», «1,2 M», «250 mil», «1,5 millones».
const CIFRA_RE = /(?<![\w.,])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?)(?:\s?(k|mil|m|mill(?:o|ó)n(?:es)?|mill?\.?|M)(?![a-záéíóúñ²]))?/gi;

function multiplicador(suf: string | undefined): number {
  if (!suf) return 1;
  const s = plano(suf).replace(/\.$/, "");
  if (s === "k" || s === "mil") return 1000;
  if (s === "m" || s.startsWith("mill")) return 1_000_000;
  return 1;
}

/** Todas las cantidades de un texto, en orden de aparición. */
export function encontrarCantidades(texto: string): Cantidad[] {
  const out: Cantidad[] = [];
  for (const m of texto.matchAll(CIFRA_RE)) {
    const cifra = parseCifra(m[1]!);
    if (!cifra) continue;
    let suf = m[2];
    // «m» suelta detrás de un número casi siempre es «m²» o metros, no millones: solo si va con € o «M».
    if (suf && /^m$/.test(suf) && !/^\s?M/.test(m[0].slice(m[1]!.length)) && !/^\s*(€|eur)/i.test(texto.slice(m.index! + m[0].length))) suf = undefined;
    const mult = multiplicador(suf);
    const literal = suf ? m[0] : m[1]!;
    out.push({
      valor: cifra.valor.mul(mult),
      alternativas: cifra.alternativa ? [cifra.alternativa.mul(mult)] : [],
      enPalabras: false,
      literal,
      inicio: m.index!,
      fin: m.index! + literal.length,
    });
  }
  // Números en palabras: secuencias máximas de palabras numéricas.
  const palabraRe = /[a-záéíóúñ]+/gi;
  let secuencia: RegExpMatchArray[] = [];
  const cerrar = () => {
    while (secuencia.length && plano(secuencia[secuencia.length - 1]![0]) === "y") secuencia.pop();
    if (secuencia.length) {
      const inicio = secuencia[0]!.index!;
      const ultimo = secuencia[secuencia.length - 1]!;
      const fin = ultimo.index! + ultimo[0].length;
      const literal = texto.slice(inicio, fin);
      const valor = parsePalabras(literal);
      // «un» o «una» solos son artículos, no cantidades.
      const esArticulo = secuencia.length === 1 && ["un", "una", "uno"].includes(plano(literal));
      if (valor !== null && !esArticulo) out.push({ valor: new Decimal(valor), alternativas: [], enPalabras: true, literal, inicio, fin });
    }
    secuencia = [];
  };
  const ocupado = out.map((c) => [c.inicio, c.fin] as const);
  let finAnterior = -1;
  for (const m of texto.matchAll(palabraRe)) {
    if (ocupado.some(([a, b]) => m.index! < b && m.index! + m[0].length > a)) {
      cerrar();
      finAnterior = -1;
      continue;
    }
    const p = plano(m[0]);
    const contiguo = finAnterior >= 0 && /^\s+$/.test(texto.slice(finAnterior, m.index!));
    if (PALABRA_NUMERICA.has(p) && (secuencia.length === 0 || contiguo)) {
      secuencia.push(m);
    } else {
      cerrar();
      if (PALABRA_NUMERICA.has(p)) secuencia.push(m);
    }
    finAnterior = m.index! + m[0].length;
  }
  cerrar();
  return out.sort((a, b) => a.inicio - b.inicio);
}
