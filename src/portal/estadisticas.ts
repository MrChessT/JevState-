import Decimal from "decimal.js";
import type { EstadisticaZona, InmuebleResumen } from "./tipos";

function percentil(ordenados: Decimal[], p: number): Decimal | null {
  if (!ordenados.length) return null;
  const pos = (ordenados.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return ordenados[lo]!.plus(ordenados[hi]!.minus(ordenados[lo]!).mul(pos - lo));
}

/** €/m² por zona (incluye los barrios en su municipio). Mínimo 3 inmuebles para publicar la cifra. */
export function estadisticaZona(path: string, inmuebles: InmuebleResumen[], operacion: "venta" | "alquiler"): EstadisticaZona {
  const deZona = inmuebles.filter((i) => i.operacion === operacion && (i.zonaPath === path || i.zonaPath.startsWith(`${path}/`)) && i.precio && i.superficie);
  const m2 = deZona.map((i) => new Decimal(i.precio!).div(i.superficie!)).sort((a, b) => a.cmp(b));
  const ok = m2.length >= 3;
  const f = (d: Decimal | null) => (ok && d ? d.toFixed(0) : null);
  return { path, n: deZona.length, medianaM2: f(percentil(m2, 0.5)), p25M2: f(percentil(m2, 0.25)), p75M2: f(percentil(m2, 0.75)) };
}

/** % respecto a la mediana de la zona (negativo = por debajo). */
export function frenteAZona(precio: number | null, superficie: number | null, mediana: string | null): number | null {
  if (!precio || !superficie || !mediana) return null;
  const m2 = new Decimal(precio).div(superficie);
  return m2.minus(mediana).div(mediana).mul(100).toDecimalPlaces(0).toNumber();
}
