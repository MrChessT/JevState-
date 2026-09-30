// Extracción determinista del mensaje (sección 4.1): cifras, zonas candidatas, requisitos,
// proximidad, tipos, habitaciones e inmuebles mencionados. Jev decide después qué significa cada cosa.
import Decimal from "decimal.js";
import { extraerMenciones, type Rasgo } from "@/extraccion/caracteristicas";
import { extraerBanos, extraerDormitorios } from "@/extraccion/estancias";
import { encontrarCantidades } from "@/extraccion/numeros";
import { extraerProximidad, type ConceptoProximidad } from "@/extraccion/proximidad";
import { plano } from "@/extraccion/texto";
import { detectarZonas, type MencionZona } from "@/zonas/buscar";

export interface CifraCandidata {
  id: string;
  valor: Decimal;
  literal: string;
  /** Pista del código: «hasta», «máximo», «desde», «/mes», «m²»… */
  pista: "maximo" | "minimo" | "aproximado" | "cuota" | "ahorros" | "ingresos" | "desconocida";
  /** Parte de un rango explícito («entre 100.000 y 150.000»): la pista manda sobre la interpretación. */
  rango?: boolean;
}

/** Cifras que no son un precio (cuota, ahorros, ingresos). */
export const noEsPrecio = (c: CifraCandidata) => c.pista === "cuota" || c.pista === "ahorros" || c.pista === "ingresos";

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
  /** Petición relativa a la búsqueda anterior («más barato», «más grande»): la resuelve el código. */
  relativo: "barato" | "grande" | null;
  /** «sin bajos», «nada de bajos»: rechazo de la planta baja. */
  sinBajos: boolean;
  /** Superficie mínima en m² («más de 100 metros»). */
  m2Min: number | null;
  /** Baños mínimos («2 baños»). */
  banosMin: number | null;
  /** «planta alta», «último piso»: se quitan los bajos y se avisa de que la planta exacta está en cada ficha. */
  plantaAlta: boolean;
  /** «algo barato» en una búsqueda nueva: se ordena por precio. */
  pideBarato: boolean;
  /** Cosas pedidas que las fichas no recogen (se dice, no se ignora en silencio). */
  noFiltrables: NoFiltrable[];
  /** Lugares mencionados fuera de la Región de Murcia (se avisa). */
  fueraRegion: string[];
}

const TIPOS: Array<[RegExp, string]> = [
  [/\b(pisos?|apartamentos?|flats?|apartments?)\b/, "piso"],
  [/\b(aticos?|penthouses?)\b/, "atico"],
  [/\bduplex\b/, "duplex"],
  [/\b(chalets?|villas?)\b/, "chalet"],
  [/\b(adosados?|pareados?|townhouses?|bungalows?)\b/, "adosado"],
  [/\b(casas?|houses?)\b/, "casa"],
  [/\b(estudios?|lofts?|studios?)\b/, "estudio"],
  [/\b(local(es)?( comercial(es)?)?|shops?|commercial premises)\b/, "local"],
  [/\b(terrenos?|parcelas?|solar(es)?|plots?|land)\b/, "terreno"],
];

const CAMPO_RASGO: Partial<Record<Rasgo, string>> = {
  terraza: "terraza", balcon: "balcon", garaje: "garaje", garaje_incluido: "garaje", trastero: "trastero", ascensor: "ascensor",
  piscina: "piscina", piscina_comunitaria: "piscina", piscina_privada: "piscina", aire_acondicionado: "aire_acondicionado",
  calefaccion: "calefaccion", amueblado: "amueblado", accesible: "accesible", exterior: "exterior", vistas_mar: "vistas",
  reformado: "estado", a_estrenar: "estado", luminoso: "luminosidad", muy_luminoso: "luminosidad", tranquilo: "ruido", muy_tranquilo: "ruido",
};

export type NoFiltrable = "jardin" | "mascotas" | "chimenea" | "licencia_turistica";
const NO_FILTRABLES: Array<[RegExp, NoFiltrable]> = [
  [/\bjardin(es)?\b|\bgardens?\b/, "jardin"],
  [/\bmascotas?\b|\bperros?\b|\bgatos?\b|\bpets?\b|\bpet[- ]friendly\b|\bdogs?\b|\bcats?\b/, "mascotas"],
  [/\bchimeneas?\b|\bfireplaces?\b/, "chimenea"],
  [/\blicencia (turistica|vacacional)\b|\bvivienda de uso turistico\b|\bvut\b|\btourist licen[cs]e\b|\bholiday rental licen[cs]e\b/, "licencia_turistica"],
];

/** Destinos habituales cercanos que NO son de la Región de Murcia (clave normalizada → nombre). */
const FUERA_REGION: Array<[RegExp, string]> = [
  [/\btorrevieja\b/, "Torrevieja"], [/\borihuela\b/, "Orihuela"], [/\bpilar de la horadada\b/, "Pilar de la Horadada"], [/\bguardamar\b/, "Guardamar"],
  [/\bsanta pola\b/, "Santa Pola"], [/\belche\b/, "Elche"], [/\balicante\b/, "Alicante"], [/\bbenidorm\b/, "Benidorm"], [/\bcalpe\b/, "Calpe"],
  [/\balmeria\b/, "Almería"], [/\bmojacar\b/, "Mojácar"], [/\bpulpi\b/, "Pulpí"], [/\bgarrucha\b/, "Garrucha"],
  [/\bvalencia\b/, "Valencia"], [/\bmadrid\b/, "Madrid"], [/\bmalaga\b/, "Málaga"], [/\bmarbella\b/, "Marbella"], [/\bbarcelona\b/, "Barcelona"], [/\bgranada\b/, "Granada"], [/\balbacete\b/, "Albacete"],
];

/** «más de 100 metros», «al menos 90 m2», «150 m²»: superficie mínima (se ignoran cifras sueltas que no van con m²). */
function superficieMinima(p: string): number | null {
  const m = p.match(/(?:(mas de|al menos|minimo|como minimo|desde|over|at least|more than|min\.?)\s+)?(?:unos\s+)?(\d{2,4})\s*(m2|m²|metros|mts|square met(re|er)s|sq ?m|sqm)\b/);
  if (!m) return null;
  const n = Number(m[2]);
  return n >= 20 && n <= 2000 ? n : null;
}

const ORDINALES: Record<string, number> = { primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, first: 1, second: 2, third: 3, ultimo: -1, ultima: -1, last: -1 };

export function extraer(mensaje: string): Extraccion {
  const p = plano(mensaje);
  const cifras: CifraCandidata[] = [];
  const dormitorios = extraerDormitorios(mensaje);
  const posiciones: Array<{ inicio: number; fin: number }> = [];
  for (const c of encontrarCantidades(mensaje)) {
    const tras = p.slice(c.fin, c.fin + 14);
    const antes = p.slice(Math.max(0, c.inicio - 22), c.inicio);
    if (/^\s*(m2|m²|metros|hab|dorm|bano|baño|min|km|%)/.test(tras) || dormitorios.some((d) => d.inicio === c.inicio)) continue;
    if (c.valor.lt(50) && !/^\s*(k|mil|€|eur)/.test(tras)) continue;
    // «unos 250» en compra = 250 mil (se ofrece como alternativa; decide Jev con presupuesto_ok).
    let valor = c.valor;
    if (c.valor.lt(2000) && /^\s*(mil|k)\b/.test(tras) === false && !/\/\s*mes|al mes|mensual|alquil|\ba month\b|per month|\/month|monthly|\brent/.test(p) && c.valor.gte(50) && c.valor.lt(1000)) valor = c.valor.mul(1000);
    // Ahorros: la palabra va pegada a la cifra («40.000 ahorrados», «ahorros de 40.000», «30.000 para la entrada»).
    const ahorros =
      /^\s*(€|euros?|mil|k)?\s*(ahorrad\w*|de ahorros|en ahorros|ahorros|para la entrada|de entrada\b(?! del)|saved|in savings|savings|for (the|a) deposit)/.test(tras.length < 22 ? p.slice(c.fin, c.fin + 26) : tras) ||
      /(ahorros de|ahorrado|ahorrados|tengo ahorrad\w*|savings of|deposit of|saved)\s*$/.test(antes);
    // Un ingreso mensual de 15.000 € o más es muy improbable: esas cifras son ahorros o precio.
    const ingresos = c.valor.lt(15000) && /\b(cobr|gan[oa]|ganamos|ingres|sueldo|salario|nomina|earn|income|salary|net)\w*/.test(p.slice(Math.max(0, c.inicio - 30), c.inicio + 1)) || /^\s*(€|euros?)?\s*(netos?\s*)?(al mes|mensuales)\s*(de sueldo|de nomina|limpios|netos|entre)/.test(tras);
    const pista = ingresos
      ? "ingresos"
      : ahorros
        ? "ahorros"
        : /(hasta|maximo|max\.?|como mucho|no mas de|menos de|up to|max|under|below)\s*$/.test(antes)
      ? "maximo"
      : /(desde|minimo|mas de|a partir de|from|at least)\s*$/.test(antes)
        ? "minimo"
        : /(unos|sobre|alrededor de|aprox|around|about)\s*$/.test(antes)
          ? "aproximado"
          : /(cuota|al mes de hipoteca|hipoteca)/.test(p.slice(Math.max(0, c.inicio - 30), c.fin + 20))
            ? "cuota"
            : "desconocida";
    cifras.push({ id: `cifra_${cifras.length + 1}`, valor, literal: c.literal, pista });
    posiciones.push({ inicio: c.inicio, fin: c.fin });
  }
  // Rango explícito: «entre 100.000 y 150.000», «de 100 a 150 mil», «between 100k and 150k».
  for (let k = 0; k + 1 < cifras.length; k++) {
    const entre = p.slice(posiciones[k]!.fin, posiciones[k + 1]!.inicio);
    const antes = p.slice(Math.max(0, posiciones[k]!.inicio - 12), posiciones[k]!.inicio);
    if (/^\s*(€|euros?|mil|k)?\s*(y|a|hasta|and|to|-)\s*$/.test(entre) && /(entre|between|de|from|desde)\s*$/.test(antes) && !noEsPrecio(cifras[k]!)) {
      cifras[k] = { ...cifras[k]!, pista: "minimo", rango: true };
      cifras[k + 1] = { ...cifras[k + 1]!, pista: "maximo", rango: true };
      // «de 100 a 150 mil»: el primero hereda la escala del segundo.
      if (cifras[k]!.valor.lt(1000) && cifras[k + 1]!.valor.gte(1000)) cifras[k] = { ...cifras[k]!, valor: cifras[k]!.valor.mul(1000) };
    }
  }
  const zonas = detectarZonas(mensaje).map((z, i) => ({ ...z, id: `zona_${i + 1}` }));
  const requisitos = extraerMenciones(mensaje)
    .filter((m) => CAMPO_RASGO[m.rasgo])
    .filter((m, i, arr) => arr.findIndex((x) => CAMPO_RASGO[x.rasgo] === CAMPO_RASGO[m.rasgo]) === i)
    .map((m, i) => ({ id: `requisito_${i + 1}`, campo: CAMPO_RASGO[m.rasgo]!, rasgo: m.rasgo, literal: m.literal, negado: m.negado }));
  // «con vistas» sin más: el campo «vistas» (el léxico de la ficha solo reconoce «vistas al mar»).
  if (!requisitos.some((r) => r.campo === "vistas")) {
    const v = /\b(con vistas|buenas vistas|vistas despejadas|vistas bonitas|with (a )?views?|nice views?)\b/.exec(p);
    if (v) requisitos.push({ id: `requisito_${requisitos.length + 1}`, campo: "vistas", rasgo: "vistas_mar", literal: v[0], negado: false });
  }
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
    textoLibre: p.split(/\s+/).length >= 14 || /\b(porque|ya que|somos|tenemos|teletrabaj\w*|trabajo desde casa|because|we are|we have|work from home)\b/.test(p),
    relativo: /\b(mas barat|menos car|mas economic|cheaper|less expensive)/.test(p) ? "barato" : /\b(mas grande|mas amplio|mas espacio|mas habitaciones|bigger|larger|more space)/.test(p) ? "grande" : null,
    plantaAlta: /\b(planta alta|plantas altas|piso alto|pisos altos|ultima planta|ultimo piso|en altura|high floor|top floor|upper floor)\b/.test(p),
    m2Min: superficieMinima(p),
    banosMin: extraerBanos(mensaje)[0]?.n ?? null,
    sinBajos: /\b(planta alta|plantas altas|piso alto|pisos altos|ultima planta|ultimo piso|en altura|high floor|top floor|upper floor)\b/.test(p) || /\b(sin|nada de|ni|no (quiero |queremos )?(un )?)\s*(pisos? )?bajos?\b|\bno sea (un )?(piso )?bajo\b|\bque no (este|sea) en (un |la )?(planta )?baja\b|\bno ground[- ]floor/.test(p),
    pideBarato: /\b(barat[oa]s?|economic[oa]s?|cheap|affordable)\b/.test(p),
    noFiltrables: NO_FILTRABLES.filter(([re]) => re.test(p)).map(([, k]) => k),
    fueraRegion: FUERA_REGION.filter(([re]) => re.test(p)).map(([, n]) => n),
    perfilDeclarado: /\b(para (vivir|mi familia|los ninos|mis hijos|invertir|alquilarlo|veranear|vacaciones|mis padres)|hijos|ninos|familia|inversion|invertir|segunda residencia|vacaciones|kids|children|family|invest)\b/.test(p),
  };
}
