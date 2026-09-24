// Importes en euros con su contexto (qué parece ser) y su periodo. El contexto es una PISTA para
// describir el candidato a Jev y para desempatar en la etapa mini; no decide nada por sí solo.
import Decimal from "decimal.js";
import { encontrarCantidades, type Cantidad } from "./numeros";
import { antes, despues, plano } from "./texto";

export type ContextoImporte = "precio" | "precio_anterior" | "comunidad" | "ibi" | "fianza" | "precio_m2" | "garaje" | "cuota" | "entrada" | "desconocido";
export type Periodo = "unico" | "mes" | "trimestre" | "año";

export interface Importe extends Cantidad {
  moneda: "EUR";
  contexto: ContextoImporte;
  periodo: Periodo;
  /** ¿Lleva símbolo o palabra de moneda? */
  conMoneda: boolean;
}

const CONTEXTOS: Array<[ContextoImporte, RegExp]> = [
  ["precio_m2", /(€|eur(os)?)\s*\/\s*m(2|²)|por\s+metro/],
  ["comunidad", /comunidad|gastos\s+de\s+comunidad|cuota\s+de\s+comunidad|community/],
  ["ibi", /\bibi\b|impuesto\s+de\s+bienes|contribucion/],
  ["fianza", /fianza|deposito|garantia|deposit/],
  ["precio_anterior", /\bantes\b|rebajad[oa]\s+de|precio\s+anterior|anteriormente|era\s+de|bajad[oa]\s+desde|was\b/],
  ["garaje", /garaje|plaza\s+de\s+aparcamiento|parking|cochera/],
  ["cuota", /cuota|hipoteca|al\s+mes\s+de\s+hipoteca|mensualidad/],
  ["entrada", /entrada|ahorros|aportar/],
  ["precio", /precio|vendo|venta|se\s+vende|alquiler|renta|por\s+solo|price|€|eur/],
];

function periodoDe(tras: string, previo: string): Periodo {
  const t = `${previo} ${tras}`;
  if (/\/\s*mes|al\s+mes|mensual|mes\b|month/.test(tras)) return "mes";
  if (/trimestr/.test(tras)) return "trimestre";
  if (/\/\s*a[nñ]o|al\s+a[nñ]o|anual|year/.test(tras)) return "año";
  if (/mensual/.test(previo)) return "mes";
  if (/trimestral/.test(previo)) return "trimestre";
  if (/anual/.test(t)) return "año";
  return "unico";
}

/** Importes del texto: con moneda, o sin ella pero con contexto claro («precio 250k»). */
export function extraerImportes(texto: string): Importe[] {
  const out: Importe[] = [];
  for (const c of encontrarCantidades(texto)) {
    // Contexto dentro de la misma cláusula: se corta en la puntuación más cercana, para que
    // «Precio 235.000 € (antes 250.000 €)» no contamine un importe con el contexto del otro.
    const tras = despues(texto, c.fin, 25).split(/[.;()]/)[0]!;
    const previo = antes(texto, c.inicio, 45).split(/[.;()]/).pop()!;
    const cercaPrevio = antes(texto, c.inicio, 4);
    const conMoneda = /^\s*(€|eur\b|euros?\b)/.test(tras) || /(€|eur)\s*$/.test(cercaPrevio) || /^\s*(k|m)?\s*€/.test(tras);
    // Detrás de «m²», «hab.», «%»… no es un importe.
    if (/^\s*(m2|m²|metros|mts|hab|dorm|baño|bano|%|kwh|km|min|planta|º|ª)/.test(tras)) continue;
    let contexto: ContextoImporte = "desconocido";
    const ventana = `${previo} ${tras.slice(0, 16)}`;
    for (const [nombre, re] of CONTEXTOS) {
      if (re.test(nombre === "precio_m2" ? tras : ventana)) {
        contexto = nombre;
        break;
      }
    }
    if (!conMoneda && (contexto === "desconocido" || (contexto === "precio" && !/precio|vendo|venta|alquiler|renta|price/.test(previo)))) continue;
    // Importes pequeños sin moneda (años, números de calle) no son precios.
    if (!conMoneda && c.valor.lt(100)) continue;
    out.push({ ...c, moneda: "EUR", contexto, periodo: periodoDe(tras, previo), conMoneda });
  }
  return out;
}

/** Importe a mensual (comunidad) o anual (IBI). */
export function aMensual(valor: Decimal, periodo: Periodo): Decimal {
  if (periodo === "trimestre") return valor.div(3).toDecimalPlaces(2);
  if (periodo === "año") return valor.div(12).toDecimalPlaces(2);
  return valor;
}

export function aAnual(valor: Decimal, periodo: Periodo): Decimal {
  if (periodo === "mes") return valor.mul(12);
  if (periodo === "trimestre") return valor.mul(4);
  return valor;
}

export function esTextoDeAlquiler(texto: string): boolean {
  return /alquil|renta\s+mensual|\/\s*mes|for\s+rent/.test(plano(texto));
}
