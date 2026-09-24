import { plano, type Tramo } from "./texto";

export type TipoPlanta = "sotano" | "bajo" | "entresuelo" | "intermedia" | "ultima" | "atico";

export interface Planta extends Tramo {
  numero: number | null;
  tipo: TipoPlanta;
}

const ORDINALES: Record<string, number> = {
  primera: 1, primer: 1, primero: 1, segunda: 2, segundo: 2, tercera: 3, tercero: 3, cuarta: 4, cuarto: 4, quinta: 5, quinto: 5,
  sexta: 6, sexto: 6, septima: 7, septimo: 7, octava: 8, octavo: 8, novena: 9, noveno: 9, decima: 10, decimo: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
};

const PATRONES: Array<[RegExp, (m: RegExpExecArray) => { numero: number | null; tipo: TipoPlanta }]> = [
  [/\b(semisotano|sotano|basement)\b/, () => ({ numero: -1, tipo: "sotano" })],
  [/\b(planta\s+baja|bajo\b(?!\s+(precio|coste|consumo))|ground\s+floor|piso\s+bajo)/, () => ({ numero: 0, tipo: "bajo" })],
  [/\bentresuelo\b|\bentreplanta\b|\bmezzanine\b/, () => ({ numero: 0, tipo: "entresuelo" })],
  [/\b(atico|penthouse)\b/, () => ({ numero: null, tipo: "atico" })],
  [/\b(ultima\s+planta|top\s+floor)\b/, () => ({ numero: null, tipo: "ultima" })],
  [/\b(?:planta|piso|floor)\s+(\d{1,2})\b/, (m) => ({ numero: Number(m[1]), tipo: "intermedia" })],
  [/\b(\d{1,2})\s?(?:ª|º|a|o|st|nd|rd|th)?\s+(?:planta|piso\b(?!\s+de)|floor)/, (m) => ({ numero: Number(m[1]), tipo: "intermedia" })],
  [/\b(\d{1,2})\s?[ªº](?=[\s,.;]|$)/, (m) => ({ numero: Number(m[1]), tipo: "intermedia" })],
  [/\b(primera|primer|segunda|segundo|tercera|tercero|cuarta|cuarto|quinta|quinto|sexta|sexto|septima|septimo|octava|octavo|novena|noveno|decima|decimo|first|second|third|fourth|fifth)\s+(?:planta|piso\b(?!\s+de)|floor)/, (m) => ({ numero: ORDINALES[m[1]!]!, tipo: "intermedia" })],
  [/\bplanta\s+(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima)\b/, (m) => ({ numero: ORDINALES[m[1]!]!, tipo: "intermedia" })],
];

/** Planta del inmueble. El primer patrón que encaja gana (sótano > bajo > entresuelo > ático > número). */
export function extraerPlanta(texto: string): Planta[] {
  const p = plano(texto);
  const out: Planta[] = [];
  for (const [re, f] of PATRONES) {
    const m = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const r of p.matchAll(m)) {
      const exec = r as unknown as RegExpExecArray;
      const v = f(exec);
      if (v.numero !== null && (v.numero > 60 || v.numero < -3)) continue;
      out.push({ ...v, literal: texto.slice(r.index!, r.index! + r[0].length), inicio: r.index!, fin: r.index! + r[0].length });
    }
  }
  // Sin duplicados por solapamiento: se queda el primero en orden de patrón.
  const final: Planta[] = [];
  for (const x of out) if (!final.some((y) => x.inicio < y.fin && x.fin > y.inicio)) final.push(x);
  return final.sort((a, b) => a.inicio - b.inicio);
}

/** Tipo de planta a partir de un número (y el total de plantas del edificio si se conoce). */
export function tipoDeNumero(n: number, totalPlantas?: number): TipoPlanta {
  if (n < 0) return "sotano";
  if (n === 0) return "bajo";
  if (totalPlantas !== undefined && n >= totalPlantas) return "ultima";
  return "intermedia";
}
