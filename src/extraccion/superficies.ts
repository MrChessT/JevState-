import Decimal from "decimal.js";
import { encontrarCantidades } from "./numeros";
import { antes, despues, type Tramo } from "./texto";

export type TipoSuperficie = "construida" | "util" | "parcela" | "terraza" | "desconocida";

export interface Superficie extends Tramo {
  m2: Decimal;
  tipo: TipoSuperficie;
}

const UNIDAD = /^\s*(m2|m²|m\s?2|mts2?|mt2|metros(\s+cuadrados)?|sqm|sq\.?\s?m)\b|^\s*m²/;
const HECTAREA = /^\s*(ha\b|hectareas?)/;

function tipoDe(ctx: string): TipoSuperficie {
  if (/parcela|terreno|solar|finca|plot|jardin\s+de/.test(ctx)) return "parcela";
  if (/terraza|balcon/.test(ctx)) return "terraza";
  if (/utiles?\b|util\b|usable|netos?/.test(ctx)) return "util";
  if (/construid|built|const\.|totales/.test(ctx)) return "construida";
  return "desconocida";
}

/**
 * Superficies en m²: «85 m²», «85m2», «90 metros cuadrados», «2 ha», y también «100 construidos»
 * cuando el tipo va sin unidad justo después de otra superficie.
 */
export function extraerSuperficies(texto: string): Superficie[] {
  const out: Superficie[] = [];
  for (const c of encontrarCantidades(texto)) {
    const tras = despues(texto, c.fin, 30);
    const previo = antes(texto, c.inicio, 25);
    const unidad = UNIDAD.exec(tras);
    const ha = HECTAREA.exec(tras);
    const tipoSinUnidad = /^\s*(construidos|utiles|útiles)\b/.test(tras);
    if (!unidad && !ha && !tipoSinUnidad) continue;
    const m2 = ha ? c.valor.mul(10_000) : c.valor;
    if (m2.lte(0) || m2.gt(10_000_000)) continue;
    const largo = (unidad ?? ha)?.[0].length ?? 0;
    // El tipo se busca en la palabra que sigue a la unidad («85 m² útiles») y, si no hay, justo antes
    // («parcela de 500 m²»). Ventanas cortas: «85 m² construidos, parcela de 500» no confunde tipos.
    const siguiente = /^\s*(?:de\s+)?([a-zñ.]+)/.exec(tras.slice(largo))?.[1] ?? "";
    let tipo = tipoDe(siguiente);
    if (tipo === "desconocida" && tipoSinUnidad) tipo = tipoDe(tras.slice(0, 14));
    if (tipo === "desconocida") tipo = tipoDe(previo.slice(-18));
    const fin = c.fin + largo;
    out.push({ m2, tipo, literal: texto.slice(c.inicio, fin), inicio: c.inicio, fin });
  }
  return out;
}
