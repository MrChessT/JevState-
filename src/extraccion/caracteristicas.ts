// Menciones de características en texto libre, con negación («sin ascensor»). Son evidencias para
// Jev (etapa reasoning) y candidatas de requisitos del usuario; nunca deciden un campo solas.
import { plano, type Tramo } from "./texto";

export type Rasgo =
  | "terraza" | "balcon" | "garaje" | "trastero" | "ascensor" | "piscina" | "aire_acondicionado" | "calefaccion"
  | "amueblado" | "accesible" | "exterior" | "vistas_mar" | "jardin" | "reformado" | "a_reformar" | "luminoso"
  | "tranquilo" | "okupado" | "nuda_propiedad" | "subasta" | "vpo" | "alquilado" | "licencia_turistica" | "negociable";

export interface Mencion extends Tramo {
  rasgo: Rasgo;
  negado: boolean;
}

const DICCIONARIO: Record<Rasgo, RegExp> = {
  terraza: /\bterrazas?\b|\bterrace\b|\bsolarium\b/,
  balcon: /\bbalcon(es)?\b|\bbalcony\b/,
  garaje: /\bgaraje\b|\bplaza\s+de\s+(garaje|aparcamiento|parking)\b|\bparking\b|\bcochera\b|\bgarage\b/,
  trastero: /\btrastero\b|\bstorage\s+room\b/,
  ascensor: /\bascensor(es)?\b|\blift\b|\belevator\b/,
  piscina: /\bpiscina\b|\bpool\b/,
  aire_acondicionado: /\baire\s+acondicionado\b|\ba\/a\b|\bclimatizaci[oó]n\b|\bsplits?\b|\bconductos\b|\bair\s+con(ditioning)?\b/,
  calefaccion: /\bcalefacci[oó]n\b|\bsuelo\s+radiante\b|\bradiadores\b|\bheating\b/,
  amueblado: /\bamueblad[oa]\b|\bfurnished\b/,
  accesible: /\baccesible\b|\bsin\s+barreras\b|\badaptad[oa]\b|\bwheelchair\b/,
  exterior: /\bexterior\b/,
  vistas_mar: /\bvistas?\s+al\s+mar\b|\bvistas?\s+al\s+mar\s+menor\b|\bsea\s+views?\b|\bprimera\s+linea\b/,
  jardin: /\bjard[ií]n\b|\bgarden\b/,
  reformado: /\breformad[oa]\b|\brenovated\b|\ba\s+estrenar\b/,
  a_reformar: /\b(a|para)\s+reformar\b|\bnecesita\s+reforma\b|\bto\s+renovate\b|\bpara\s+actualizar\b/,
  luminoso: /\bluminos[oa]\b|\bmucha\s+luz\b|\bbright\b/,
  tranquilo: /\btranquil[oa]\b|\bsilencios[oa]\b|\bquiet\b/,
  okupado: /\bokupad[oa]\b|\bocupad[oa]\s+ilegalmente\b|\bsin\s+posesi[oó]n\b/,
  nuda_propiedad: /\bnuda\s+propiedad\b/,
  subasta: /\bsubasta\b|\bejecuci[oó]n\s+hipotecaria\b|\bauction\b/,
  vpo: /\bvpo\b|\bvivienda\s+protegida\b|\bproteccion\s+oficial\b/,
  alquilado: /\balquilad[oa]\s+(con|a)\b|\bcon\s+inquilino\b|\bideal\s+inversores?\b|\brentabilidad\b/,
  licencia_turistica: /\blicencia\s+tur[ií]stica\b|\bvut\b|\bregistro\s+tur[ií]stico\b/,
  negociable: /\bnegociable\b|\bse\s+escuchan\s+ofertas\b|\bnegotiable\b/,
};

const NEGACION = /\b(sin|no\s+tiene|no\s+dispone\s+de|no\s+hay|carece\s+de|no\s+incluye|without|no)\s+(\w+\s+){0,2}$/;

export function extraerMenciones(texto: string): Mencion[] {
  const p = plano(texto);
  const out: Mencion[] = [];
  for (const [rasgo, re] of Object.entries(DICCIONARIO) as Array<[Rasgo, RegExp]>) {
    for (const m of p.matchAll(new RegExp(re.source, "g"))) {
      const previo = p.slice(Math.max(0, m.index! - 25), m.index!);
      out.push({ rasgo, negado: NEGACION.test(previo), literal: texto.slice(m.index!, m.index! + m[0].length), inicio: m.index!, fin: m.index! + m[0].length });
    }
  }
  // Menciones cercanas del mismo rasgo y polaridad («aire acondicionado por conductos») cuentan una vez.
  const orden = out.sort((a, b) => a.inicio - b.inicio);
  return orden.filter((x, i) => !orden.slice(0, i).some((y) => y.rasgo === x.rasgo && y.negado === x.negado && x.inicio - y.fin < 40));
}
