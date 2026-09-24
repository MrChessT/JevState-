// Certificado energético, referencia catastral, fechas y direcciones.
import { plano, type Tramo } from "./texto";

// Certificado energético --------------------------------------------------------------

export type Certificado = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "en_tramite" | "exento";

export function extraerCertificado(texto: string): Array<Tramo & { valor: Certificado }> {
  const p = plano(texto);
  const out: Array<Tramo & { valor: Certificado }> = [];
  const letra = /(certificad[oa]|calificacion|eficiencia|clasificacion|energy\s+rating|cee|etiqueta)\s*(energetic[oa])?\s*(de\s+consumo|consumo|emisiones)?\s*[:.-]?\s*(?:letra\s+)?\(?([a-g])\)?(?![a-z])/g;
  for (const m of p.matchAll(letra)) out.push({ valor: m[4] as Certificado, literal: texto.slice(m.index!, m.index! + m[0].length), inicio: m.index!, fin: m.index! + m[0].length });
  const tramite = /(certificad[oa]|calificacion|eficiencia)\s*(energetic[oa])?[^.]{0,20}?(en\s+tramite|en\s+tramitacion|en\s+proceso|pendiente)/g;
  for (const m of p.matchAll(tramite)) out.push({ valor: "en_tramite", literal: texto.slice(m.index!, m.index! + m[0].length), inicio: m.index!, fin: m.index! + m[0].length });
  const exento = /(exento|exenta)\s+(de\s+)?(certificad|calificacion)|(certificad[oa]|calificacion)\s*(energetic[oa])?\s*[:.-]?\s*exent/g;
  for (const m of p.matchAll(exento)) out.push({ valor: "exento", literal: texto.slice(m.index!, m.index! + m[0].length), inicio: m.index!, fin: m.index! + m[0].length });
  return out.sort((a, b) => a.inicio - b.inicio);
}

// Referencia catastral --------------------------------------------------------------------

/**
 * Referencia catastral urbana: 20 caracteres (7 finca + 7 hoja + 4 cargo + 2 de control).
 * Se valida el formato; los dígitos de control no se recalculan (D-104).
 */
export function extraerReferenciaCatastral(texto: string): Array<Tramo & { valor: string }> {
  const out: Array<Tramo & { valor: string }> = [];
  const re = /\b([0-9A-Z]{7})\s?([0-9A-Z]{7})\s?(\d{4})\s?([A-Z]{2})\b/g;
  for (const m of texto.toUpperCase().matchAll(re)) {
    const valor = `${m[1]}${m[2]}${m[3]}${m[4]}`;
    // Al menos 4 dígitos en los primeros 14 (evita palabras en mayúsculas).
    if ((valor.slice(0, 14).match(/\d/g) ?? []).length < 4) continue;
    out.push({ valor, literal: texto.slice(m.index!, m.index! + m[0].length), inicio: m.index!, fin: m.index! + m[0].length });
  }
  return out;
}

// Fechas --------------------------------------------------------------------------------

const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

function iso(a: number, m: number, d: number): string | null {
  if (a < 100) a += a >= 70 ? 1900 : 2000;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/** «15/03/2024», «15-03-24», «2024-03-15», «15 de marzo de 2024». Devuelve AAAA-MM-DD o null. */
export function parseFecha(texto: string): string | null {
  const t = plano(texto).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})$/.exec(t);
  if (m && MESES[m[2]!]) return iso(+m[3]!, MESES[m[2]!]!, +m[1]!);
  return null;
}

// Direcciones -----------------------------------------------------------------------------

const TIPOS_VIA: Array<[RegExp, string]> = [
  [/^(c\/|c\.|cl\.?|calle)\s*/i, "Calle"],
  [/^(avda\.?|av\.?|avenida)\s*/i, "Avenida"],
  [/^(pza\.?|pl\.?|plaza)\s*/i, "Plaza"],
  [/^(ctra\.?|carretera)\s*/i, "Carretera"],
  [/^(pº|p\.º|pso\.?|paseo)\s*/i, "Paseo"],
  [/^(urb\.?|urbanizacion|urbanización)\s*/i, "Urbanización"],
  [/^(camino|cno\.?)\s*/i, "Camino"],
];

export interface Direccion {
  via: string | null;
  numero: string | null;
  codigoPostal: string | null;
  /** Resto (municipio, pedanía…) para el geocodificador. */
  resto: string;
}

export function normalizarDireccion(texto: string): Direccion {
  const cp = /\b(30\d{3}|0[1-9]\d{3}|[1-5]\d{4})\b/.exec(texto)?.[1] ?? null;
  const partes = texto.split(",").map((p) => p.trim()).filter(Boolean);
  let via: string | null = null;
  let numero: string | null = null;
  const primera = partes[0] ?? "";
  for (const [re, nombre] of TIPOS_VIA) {
    if (re.test(primera)) {
      const resto = primera.replace(re, "");
      const n = /\s(\d+[a-z]?)$/i.exec(resto);
      via = `${nombre} ${(n ? resto.slice(0, n.index) : resto).trim()}`;
      numero = n?.[1] ?? null;
      break;
    }
  }
  if (via && !numero && partes[1] && /^\d+[a-z]?$/i.test(partes[1])) numero = partes[1];
  const resto = partes
    .slice(via ? 1 : 0)
    .filter((p) => !/^\d+[a-z]?$/i.test(p) && !/^\d+\s?[ºª]/.test(p))
    .join(", ")
    .replace(/\b\d{5}\b/, "")
    .trim();
  return { via, numero, codigoPostal: cp, resto };
}
