// Búsqueda difusa de zonas con erratas y alias (sección 4.1): el código propone candidatas; en el
// asistente, Jev elige entre ellas (zona_i). Misma lógica que buscar_zonas() en SQL, en memoria.
import { clave } from "@/extraccion/texto";
import { BARRIOS, colindancias, MUNICIPIOS } from "./datos";

export interface Zona {
  /** Ruta: «murcia», «murcia/el-carmen». */
  path: string;
  nivel: "municipio" | "barrio";
  nombre: string;
  municipio: string;
  nombreMunicipio: string;
  ine: string;
  lat: number;
  lon: number;
  costa: boolean;
  /** Nombre y alias normalizados. */
  claves: string[];
}

export const ZONAS: Zona[] = [
  ...MUNICIPIOS.map((m) => ({
    path: m.slug,
    nivel: "municipio" as const,
    nombre: m.nombre,
    municipio: m.slug,
    nombreMunicipio: m.nombre,
    ine: m.ine,
    lat: m.lat,
    lon: m.lon,
    costa: m.costa,
    claves: [clave(m.nombre), ...m.alias.map(clave)],
  })),
  ...BARRIOS.map((b) => {
    const m = MUNICIPIOS.find((x) => x.slug === b.municipio)!;
    return {
      path: `${b.municipio}/${b.slug}`,
      nivel: "barrio" as const,
      nombre: b.nombre,
      municipio: b.municipio,
      nombreMunicipio: m.nombre,
      ine: m.ine,
      lat: b.lat,
      lon: b.lon,
      costa: b.costa ?? false,
      claves: [clave(b.nombre), ...b.alias.map(clave)],
    };
  }),
];

const POR_PATH = new Map(ZONAS.map((z) => [z.path, z]));
const COLINDANCIAS = colindancias();

export function zona(path: string): Zona | undefined {
  return POR_PATH.get(path);
}

export function colindantes(municipio: string): string[] {
  return [...(COLINDANCIAS.get(municipio) ?? [])].sort();
}

// Similitud -----------------------------------------------------------------------------

/** Distancia de Damerau-Levenshtein (transposiciones incluidas). */
export function damerau(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + coste);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

function trigramas(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Similitud 0-1: la mejor entre edición (erratas) y trigramas (palabras cambiadas de sitio). */
export function similitud(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const ed = 1 - damerau(a, b) / Math.max(a.length, b.length);
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  const dice = (2 * comunes) / (ta.size + tb.size);
  return Math.max(ed, dice);
}

export interface Candidata {
  zona: Zona;
  score: number;
  /** La consulta coincide exactamente con el nombre o un alias (evidencia literal). */
  literal: boolean;
}

export function buscarZonas(consulta: string, opciones: { limite?: number; minimo?: number; nivel?: Zona["nivel"]; municipio?: string } = {}): Candidata[] {
  const q = clave(consulta);
  if (!q) return [];
  const { limite = 5, minimo = 0.6 } = opciones;
  const out: Candidata[] = [];
  for (const z of ZONAS) {
    if (opciones.nivel && z.nivel !== opciones.nivel) continue;
    if (opciones.municipio && z.municipio !== opciones.municipio) continue;
    let mejor = 0;
    for (const k of z.claves) mejor = Math.max(mejor, similitud(q, k));
    if (mejor >= minimo) out.push({ zona: z, score: Number(mejor.toFixed(3)), literal: mejor === 1 });
  }
  // A igual puntuación, primero municipios (más probables sin más contexto).
  return out.sort((a, b) => b.score - a.score || (a.zona.nivel === "municipio" ? -1 : 1) - (b.zona.nivel === "municipio" ? -1 : 1)).slice(0, limite);
}

// Detección en texto libre ---------------------------------------------------------------

/** Nombres de zona que también son palabras comunes: solo cuentan con mayúscula o tras «en/de…». */
const COMUNES = new Set(["blanca", "fortuna", "mula", "pliego", "roda", "algar", "carmen", "ribera", "manga", "palmar", "alberca", "peral", "flota", "infante", "dolores", "canteras", "centro", "ensanche", "churra", "molina", "alhama", "ranero", "dolores", "el puerto", "caravaca"]);
const PREPOSICIONES = new Set(["en", "de", "del", "por", "zona", "barrio", "cerca", "hacia", "junto", "near", "in", "at"]);
const VACIAS = new Set(["de", "la", "el", "los", "las", "en", "del", "y", "a", "por", "con", "para", "un", "una", "que", "o", "al", "mi", "me"]);

export interface MencionZona {
  literal: string;
  inicio: number;
  fin: number;
  candidatas: Candidata[];
}

export function detectarZonas(texto: string, opciones: { umbral?: number } = {}): MencionZona[] {
  const umbral = opciones.umbral ?? 0.82;
  const palabras = [...texto.matchAll(/[\p{L}\d-]+/gu)].map((m) => ({ original: m[0], k: clave(m[0]), inicio: m.index!, fin: m.index! + m[0].length }));
  const propuestas: Array<MencionZona & { score: number; n: number }> = [];
  for (let i = 0; i < palabras.length; i++) {
    for (let n = 1; n <= 5 && i + n <= palabras.length; n++) {
      const ventana = palabras.slice(i, i + n);
      if (VACIAS.has(ventana[ventana.length - 1]!.k) || (n === 1 && VACIAS.has(ventana[0]!.k))) continue;
      const q = ventana.map((w) => w.k).join(" ");
      if (q.length < 4) continue;
      const cands = buscarZonas(q, { limite: 6, minimo: umbral });
      if (!cands.length) continue;
      const mejor = cands[0]!;
      if (COMUNES.has(q) && !(/^\p{Lu}/u.test(ventana[0]!.original) || PREPOSICIONES.has(palabras[i - 1]?.k ?? ""))) continue;
      const cercanas = cands.filter((c) => c.score >= mejor.score - 0.08);
      propuestas.push({ literal: texto.slice(ventana[0]!.inicio, ventana[n - 1]!.fin), inicio: ventana[0]!.inicio, fin: ventana[n - 1]!.fin, candidatas: cercanas, score: mejor.score, n });
    }
  }
  // Voraz: mejor puntuación y, a igualdad, más palabras; sin solapes.
  propuestas.sort((a, b) => b.score - a.score || b.n - a.n);
  const elegidas: MencionZona[] = [];
  for (const p of propuestas) if (!elegidas.some((e) => p.inicio < e.fin && p.fin > e.inicio)) elegidas.push({ literal: p.literal, inicio: p.inicio, fin: p.fin, candidatas: p.candidatas });
  return elegidas.sort((a, b) => a.inicio - b.inicio);
}
