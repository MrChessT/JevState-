// Calculadora de hipoteca ORIENTATIVA (sistema francés, cuota constante). El código calcula con
// decimal.js; la interfaz dice siempre que es orientativa.
import Decimal from "decimal.js";

export interface EntradaHipoteca {
  precio: string;
  /** Porcentaje de entrada sobre el precio (p. ej. "20"). */
  entradaPct: string;
  /** Tipo de interés anual en % (p. ej. "3.2"). */
  interesAnual: string;
  anos: number;
  /** Gastos e impuestos de compraventa estimados en % del precio (ITP/IVA, notaría, registro…). */
  gastosPct?: string;
}

export interface ResultadoHipoteca {
  prestamo: string;
  cuotaMensual: string;
  totalIntereses: string;
  ahorroNecesario: string;
}

export function calcularHipoteca(e: EntradaHipoteca): ResultadoHipoteca {
  const precio = new Decimal(e.precio);
  const entrada = precio.mul(e.entradaPct).div(100);
  const prestamo = Decimal.max(0, precio.minus(entrada));
  const n = Math.max(1, Math.round(e.anos * 12));
  const i = new Decimal(e.interesAnual).div(100).div(12);
  const cuota = i.isZero() ? prestamo.div(n) : prestamo.mul(i).div(new Decimal(1).minus(new Decimal(1).plus(i).pow(-n)));
  const gastos = precio.mul(e.gastosPct ?? "10").div(100);
  return {
    prestamo: prestamo.toFixed(0),
    cuotaMensual: cuota.toFixed(2),
    totalIntereses: Decimal.max(0, cuota.mul(n).minus(prestamo)).toFixed(0),
    ahorroNecesario: entrada.plus(gastos).toFixed(0),
  };
}

export interface EntradaAsequible {
  /** Ahorros disponibles para entrada y gastos. */
  ahorros?: string | null;
  /** Ingresos netos mensuales del hogar. */
  ingresosMes?: string | null;
  interesAnual: string;
  anos: number;
  /** Entrada que exige el banco, en % del precio (20 por defecto). */
  entradaPct?: string;
  /** Impuestos y gastos de compra en % del precio (10 por defecto). */
  gastosPct?: string;
  /** Cuota máxima en % de los ingresos (35 por defecto, criterio habitual de los bancos). */
  esfuerzoPct?: string;
}

export interface ResultadoAsequible {
  /** Precio máximo orientativo, redondeado a la baja a miles. */
  precioMax: string;
  limitadoPor: "ahorros" | "ingresos";
  porAhorros: string | null;
  porIngresos: string | null;
  prestamo: string;
  cuotaMensual: string;
  ahorroNecesario: string;
}

/**
 * Qué precio se puede permitir un hogar (inversa de la hipoteca): el menor entre lo que cubren
 * los ahorros (entrada + gastos) y lo que permite la cuota máxima sobre los ingresos. Orientativo.
 */
export function precioAsequible(e: EntradaAsequible): ResultadoAsequible | null {
  const entrada = new Decimal(e.entradaPct ?? "20").div(100);
  const gastos = new Decimal(e.gastosPct ?? "10").div(100);
  const porAhorros = e.ahorros ? new Decimal(e.ahorros).div(entrada.plus(gastos)) : null;
  let porIngresos: Decimal | null = null;
  if (e.ingresosMes) {
    const cuotaMax = new Decimal(e.ingresosMes).mul(e.esfuerzoPct ?? "35").div(100);
    const n = Math.max(1, Math.round(e.anos * 12));
    const i = new Decimal(e.interesAnual).div(100).div(12);
    const prestamoMax = i.isZero() ? cuotaMax.mul(n) : cuotaMax.mul(new Decimal(1).minus(new Decimal(1).plus(i).pow(-n))).div(i);
    // Con ahorros, lo que sobra tras los gastos se aporta como entrada (más de lo mínimo si hay):
    // P = (préstamo máximo + ahorros) / (1 + gastos). Sin ahorros, entrada mínima.
    porIngresos = e.ahorros ? prestamoMax.plus(e.ahorros).div(new Decimal(1).plus(gastos)) : prestamoMax.div(new Decimal(1).minus(entrada));
  }
  const candidatos = [porAhorros, porIngresos].filter((x): x is Decimal => x !== null);
  if (!candidatos.length) return null;
  const precio = Decimal.min(...candidatos).div(1000).floor().mul(1000);
  if (precio.lte(0)) return null;
  // Entrada real: lo que se aporta tras pagar los gastos (nunca menos que la mínima).
  const aportada = e.ahorros ? Decimal.max(entrada, new Decimal(e.ahorros).minus(precio.mul(gastos)).div(precio)) : entrada;
  const h = calcularHipoteca({ precio: precio.toString(), entradaPct: Decimal.min(100, aportada.mul(100)).toString(), interesAnual: e.interesAnual, anos: e.anos, gastosPct: gastos.mul(100).toString() });
  return {
    precioMax: precio.toFixed(0),
    limitadoPor: porAhorros && (!porIngresos || porAhorros.lte(porIngresos)) ? "ahorros" : "ingresos",
    porAhorros: porAhorros?.toFixed(0) ?? null,
    porIngresos: porIngresos?.toFixed(0) ?? null,
    prestamo: h.prestamo,
    cuotaMensual: h.cuotaMensual,
    ahorroNecesario: h.ahorroNecesario,
  };
}
