// Filtro, orden y facetas en memoria (desarrollo y tests). Misma semántica que buscar_inmuebles() en SQL.
import Decimal from "decimal.js";
import { POR_PAGINA, type Filtros } from "./filtros";
import type { ResultadoBusqueda } from "./repositorio";
import type { InmuebleResumen } from "./tipos";

/** Un requisito se cumple con estado confirmado o probable (sección 4.4). */
export function cumpleRasgo(i: InmuebleResumen, campo: string): boolean {
  return i.rasgos.some((r) => r.campo === campo && (r.status === "confirmado" || r.status === "probable"));
}

export function buscarEnMemoria(todos: InmuebleResumen[], f: Filtros): ResultadoBusqueda {
  const base = todos.filter(
    (i) =>
      i.operacion === f.operacion &&
      (!f.zona || i.zonaPath === f.zona || i.zonaPath.startsWith(`${f.zona}/`)) &&
      (!f.precioMin || (i.precio ?? 0) >= f.precioMin) &&
      (!f.precioMax || (i.precio !== null && i.precio <= f.precioMax)) &&
      (f.habMin === undefined || (i.habitaciones ?? 0) >= f.habMin) &&
      (!f.banosMin || (i.banos ?? 0) >= f.banosMin) &&
      (!f.m2Min || (i.superficie ?? 0) >= f.m2Min) &&
      f.con.every((c) => cumpleRasgo(i, c)),
  );
  const filtrados = base.filter((i) => !f.tipos.length || (i.tipo !== null && (f.tipos as string[]).includes(i.tipo)));
  const m2 = (i: InmuebleResumen) => (i.precio && i.superficie ? new Decimal(i.precio).div(i.superficie).toNumber() : Infinity);
  const orden: Record<Filtros["orden"], (a: InmuebleResumen, b: InmuebleResumen) => number> = {
    recientes: (a, b) => b.publicadoEn.localeCompare(a.publicadoEn) || a.ref.localeCompare(b.ref),
    precio_asc: (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity),
    precio_desc: (a, b) => (b.precio ?? -1) - (a.precio ?? -1),
    m2_precio_asc: (a, b) => m2(a) - m2(b),
    superficie_desc: (a, b) => (b.superficie ?? 0) - (a.superficie ?? 0),
  };
  const ordenados = [...filtrados].sort(orden[f.orden]);
  const contar = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((acc, x) => ((acc[x] = (acc[x] ?? 0) + 1), acc), {})).map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n);
  return {
    items: ordenados.slice((f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA),
    total: ordenados.length,
    puntos: ordenados.filter((i) => i.lat !== null && i.lon !== null).map((i) => ({ ref: i.ref, lat: i.lat!, lon: i.lon!, precio: i.precio })),
    // Facetas de tipo sobre el resultado sin el filtro de tipo (para poder ampliar).
    facetas: { tipos: contar(base.map((i) => i.tipo ?? "otro")), zonas: contar(filtrados.map((i) => i.zonaPath.split("/")[0]!)) },
  };
}
