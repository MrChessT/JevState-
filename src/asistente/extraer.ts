// Extracción determinista del mensaje (sección 4.1): cifras, zonas candidatas, requisitos,
// proximidad, tipos, habitaciones e inmuebles mencionados. Jev decide después qué significa cada cosa.
import Decimal from "decimal.js";
import { extraerMenciones, type Rasgo } from "@/extraccion/caracteristicas";
import { extraerDormitorios } from "@/extraccion/estancias";
import { encontrarCantidades } from "@/extraccion/numeros";
import { extraerProximidad, type ConceptoProximidad } from "@/extraccion/proximidad";
import { plano } from "@/extraccion/texto";
import { detectarZonas, type MencionZona } from "@/zonas/buscar";

export interface CifraCandidata {
  id: string;
  valor: Decimal;
  literal: string;
  /** Pista del código: «hasta», «máximo», «desde», «/mes», «m²»… */
  pista: "maximo" | "minimo" | "aproximado" | "cuota" | "desconocida";
}

export interface Extraccion {
  cifras: CifraCandidata[];
  zonas: Array<MencionZona & { id: string }>;
  requisitos: Array<{ id: string; campo: string; rasgo: Rasgo; literal: string; negado: boolean }>;
  proximidad: Array<{ id: string; concepto: ConceptoProximidad; literal: string }>;
  tipos: string[];
  habitaciones: number | null;
  operacion: "venta" | "alquiler" | null;
  /** Referencias explícitas («FIC-0012», «ref 1234») u ordinales («el segundo»). */
  inmuebles: { refs: string[]; ordinal: number | null; deictico: boolean };
  /** El mensaje tiene texto libre de motivos (para prioridad y encaje). */
  textoLibre: boolean;
  perfilDeclarado: boolean;
  /** «sin bajos», «nada de bajos»: rechazo de la planta baja. */
  sinBajos: boolean;
}

const TIPOS: Array<[RegExp, string]> = [
  [/\b(pisos?|apartamentos?|flats?|apartments?)\b/, "piso"],
  [/\b(aticos?|penthouses?)\b/, "atico"],
  [/\bduplex\b/, "duplex"],
  [/\b(chalets?|villas?)\b/, "chalet"],
  [/\b(adosados?|pareados?|townhouses?|bungalows?)\b/, "adosado"],
  [/\b(casas?|houses?)\b/, "casa"],
  [/\b(estudios?|lofts?|studios?)\b/, "estudio"],
  [/\b(locales?|shops?)\b/, "local"],
  [/\b(terrenos?|parcelas?|solares?|plots?)\b/, "terreno"],
];

const CAMPO_RASGO: Partial<Record<Rasgo, string>> = {
  terraza: "terraza", balcon: "balcon", garaje: "garaje", garaje_incluido: "garaje", trastero: "trastero", ascensor: "ascensor",
  piscina: "piscina", piscina_comunitaria: "piscina", piscina_privada: "piscina", aire_acondicionado: "aire_acondicionado",
  calefaccion: "calefaccion", amueblado: "amueblado", accesible: "accesible", exterior: "exterior", vistas_mar: "vistas",
  jardin: "jardin", reformado: "estado", a_estrenar: "estado", luminoso: "luminosidad", muy_luminoso: "luminosidad", tranquilo: "ruido", muy_tranquilo: "ruido",
};

const ORDINALES: Record<string, number> = { primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, first: 1, second: 2, third: 3, ultimo: -1, ultima: -1, last: -1 };

export function extraer(mensaje: string): Extraccion {
  const p = plano(mensaje);
  const cifras: CifraCandidata[] = [];
  const dormitorios = extraerDormitorios(mensaje);
  for (const c of encontrarCantidades(mensaje)) {
    const tras = p.slice(c.fin, c.fin + 14);
    const antes = p.slice(Math.max(0, c.inicio - 22), c.inicio);
    if (/^\s*(m2|m²|metros|hab|dorm|bano|baño|min|km|%)/.test(tras) || dormitorios.some((d) => d.inicio === c.inicio)) continue;
    if (c.valor.lt(50) && !/^\s*(k|mil|€|eur)/.test(tras)) continue;
    // «unos 250» en compra = 250 mil (se ofrece como alternativa; decide Jev con presupuesto_ok).
    let valor = c.valor;
    if (c.valor.lt(2000) && /^\s*(mil|k)\b/.test(tras) === false && !/\/\s*mes|al mes|mensual|alquiler/.test(p) && c.valor.gte(50) && c.valor.lt(1000)) valor = c.valor.mul(1000);
    const pista = /(hasta|maximo|max\.?|como mucho|no mas de|menos de|up to|max|under|below)\s*$/.test(antes)
      ? "maximo"
      : /(desde|minimo|mas de|a partir de|from|at least)\s*$/.test(antes)
        ? "minimo"
        : /(unos|sobre|alrededor de|aprox|around|about)\s*$/.test(antes)
          ? "aproximado"
          : /(cuota|al mes de hipoteca|hipoteca)/.test(p.slice(Math.max(0, c.inicio - 30), c.fin + 20))
            ? "cuota"
            : "desconocida";
    cifras.push({ id: `cifra_${cifras.length + 1}`, valor, literal: c.literal, pista });
  }
  const zonas = detectarZonas(mensaje).map((z, i) => ({ ...z, id: `zona_${i + 1}` }));
  const requisitos = extraerMenciones(mensaje)
    .filter((m) => CAMPO_RASGO[m.rasgo])
    .filter((m, i, arr) => arr.findIndex((x) => CAMPO_RASGO[x.rasgo] === CAMPO_RASGO[m.rasgo]) === i)
    .map((m, i) => ({ id: `requisito_${i + 1}`, campo: CAMPO_RASGO[m.rasgo]!, rasgo: m.rasgo, literal: m.literal, negado: m.negado }));
  const proximidad = extraerProximidad(mensaje).map((x, i) => ({ id: `proximidad_${i + 1}`, concepto: x.concepto, literal: x.literal }));
  const tipos = TIPOS.filter(([re]) => re.test(p)).map(([, t]) => t);
  const refs = [...mensaje.matchAll(/\b(?:ref\.?\s*)?([A-Z]{2,4}-\d{2,6})\b/gi)].map((m) => m[1]!.toUpperCase());
  const ordinal = Object.entries(ORDINALES).find(([k]) => new RegExp(`\\b(el|la|the)\\s+${k}\\b`).test(p))?.[1] ?? null;
  return {
    cifras,
    zonas,
    requisitos,
    proximidad,
    tipos: [...new Set(tipos)],
    habitaciones: dormitorios[0]?.n ?? null,
    operacion: /\b(alquil|alquiler|rent|renta mensual)/.test(p) ? "alquiler" : /\b(compr|venta|vend|buy|purchase)/.test(p) ? "venta" : null,
    inmuebles: { refs, ordinal, deictico: /\b(este|esta|este piso|esta casa|this one|this)\b/.test(p) },
    textoLibre: p.split(/\s+/).length >= 9 || /\b(porque|para|ya que|necesito|queremos|quiero|somos|tenemos|because|we need)\b/.test(p),
    sinBajos: /\b(sin|nada de|no (quiero |queremos )?(un )?)bajos?\b|\bno ground floor/.test(p),
    perfilDeclarado: /\b(para (vivir|mi familia|los ninos|mis hijos|invertir|alquilarlo|veranear|vacaciones|mis padres)|hijos|ninos|familia|inversion|invertir|segunda residencia|vacaciones|kids|children|family|invest)\b/.test(p),
  };
}
