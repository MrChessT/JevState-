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
