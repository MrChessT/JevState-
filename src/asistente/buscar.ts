// Recomendación (sección 4.4): filtro duro + tolerancia → relajación ordenada si no hay nada →
// preorden por código → (llamada 2 opcional) → «por qué» con plantillas.
import Decimal from "decimal.js";
import { cumpleRasgo } from "@/portal/buscar-memoria";
import { estadisticaZona } from "@/portal/estadisticas";
import type { EstadisticaZona, InmuebleResumen } from "@/portal/tipos";
import { colindantes, zona } from "@/zonas/buscar";
import type { FichaBusqueda } from "./ficha";

export type Relajacion = "colindantes" | "tolerancia_10" | "requisitos_deseables" | "menos_habitaciones";
export const ORDEN_RELAJACION: Relajacion[] = ["colindantes", "tolerancia_10", "requisitos_deseables", "menos_habitaciones"];

export interface Candidato {
  i: InmuebleResumen;
  puntos: number;
  /** % sobre el presupuesto (si lo supera dentro de la tolerancia). */
  sobrePresupuesto: number | null;
  /** % frente a la mediana de su zona (negativo = por debajo). */
  frenteZona: number | null;
  /** Zona con la que se compara: el barrio si tiene muestra suficiente; si no, el municipio. */
  zonaComparada: string | null;
  deseablesCumplidos: string[];
  deseablesProbables: string[];
  encaje?: number;
}

export interface ResultadoRecomendacion {
  candidatos: Candidato[];
  total: number;
  relajaciones: Array<{ tipo: Relajacion; total: number }>;
  fichaEfectiva: FichaBusqueda;
}

function municipio(path: string) {
  return path.split("/")[0]!;
}

/** «Casa» sin más incluye chalets y adosados; «piso», áticos y dúplex (sección 4.2: TIPOS). */
const TIPOS_INCLUIDOS: Record<string, string[]> = { casa: ["casa", "chalet", "adosado"], piso: ["piso", "atico", "duplex"] };

export function filtrar(todos: InmuebleResumen[], f: FichaBusqueda): InmuebleResumen[] {
  const zonas = [...f.zonas];
  const max = f.precioMax ? new Decimal(f.precioMax).mul(1 + f.tolerancia / 100).toNumber() : null;
  return todos.filter((i) => {
    if (f.operacion && (f.operacion === "venta" ? i.operacion !== "venta" : i.operacion === "venta")) return false;
    if (zonas.length && !zonas.some((z) => i.zonaPath === z || i.zonaPath.startsWith(`${z}/`))) return false;
    if (max !== null && (i.precio === null || i.precio > max)) return false;
    if (f.precioMin && (i.precio ?? 0) < f.precioMin) return false;
    if (f.habMin !== undefined && (i.habitaciones ?? 0) < f.habMin) return false;
    if (f.tipos.length && !f.tipos.some((t) => (TIPOS_INCLUIDOS[t] ?? [t]).includes(i.tipo ?? ""))) return false;
    if (f.descartados.includes(i.ref)) return false;
    for (const [campo, nivel] of Object.entries(f.requisitos)) {
      if (campo === "planta_baja") {
        if (nivel === "rechazo" && i.plantaTipo === "bajo") return false;
        continue;
      }
      if (nivel === "imprescindible" && !cumpleRasgo(i, campo)) return false;
      if (nivel === "rechazo" && cumpleRasgo(i, campo)) return false;
    }
    return true;
  });
}

function relajar(f: FichaBusqueda, r: Relajacion): FichaBusqueda | null {
  if (r === "colindantes") {
    if (!f.zonas.length) return null;
    const vecinas = [...new Set(f.zonas.flatMap((z) => colindantes(municipio(z))))].filter((z) => !f.zonas.includes(z));
    return vecinas.length ? { ...f, zonas: [...f.zonas.map(municipio), ...vecinas], zonasAmpliadas: [...f.zonasAmpliadas, ...vecinas] } : null;
  }
  if (r === "tolerancia_10") return f.precioMax && f.tolerancia < 10 ? { ...f, tolerancia: 10 } : null;
  if (r === "requisitos_deseables") {
    const imp = Object.entries(f.requisitos).filter(([, n]) => n === "imprescindible");
    return imp.length ? { ...f, requisitos: Object.fromEntries(Object.entries(f.requisitos).map(([k, n]) => [k, n === "imprescindible" ? "deseable" : n])) } : null;
  }
  return f.habMin && f.habMin > 1 ? { ...f, habMin: f.habMin - 1 } : null;
}

const PESOS_PRIORIDAD: Record<string, { precio: number; deseables: number; frescura: number; espacio: number }> = {
  precio: { precio: 3, deseables: 1, frescura: 0.5, espacio: 0.5 },
  espacio: { precio: 1, deseables: 1, frescura: 0.5, espacio: 3 },
  ubicacion: { precio: 1, deseables: 1, frescura: 0.5, espacio: 1 },
  estado: { precio: 1, deseables: 2, frescura: 0.5, espacio: 1 },
  rentabilidad: { precio: 2.5, deseables: 0.5, frescura: 0.5, espacio: 0.5 },
  tranquilidad: { precio: 1, deseables: 2, frescura: 0.5, espacio: 1 },
  // El perfil declarado solo aporta pesos por defecto (sección 4.4).
  vivienda_habitual_con_hijos: { precio: 1.5, deseables: 1.5, frescura: 0.5, espacio: 2 },
  inversion: { precio: 2.5, deseables: 0.5, frescura: 0.5, espacio: 0.5 },
  defecto: { precio: 1.5, deseables: 1.5, frescura: 0.5, espacio: 1 },
};

/** Muestra mínima para comparar con la mediana del barrio en vez de la del municipio. */
const MUESTRA_MINIMA = 5;

export function preordenar(lista: InmuebleResumen[], f: FichaBusqueda, estadisticas: Map<string, EstadisticaZona>): Candidato[] {
  const w = PESOS_PRIORIDAD[f.prioridad ?? ""] ?? PESOS_PRIORIDAD[f.perfil ?? ""] ?? PESOS_PRIORIDAD.defecto!;
  const deseables = Object.entries(f.requisitos).filter(([c, n]) => n === "deseable" && c !== "planta_baja").map(([c]) => c);
  const ahora = Date.now();
  return lista
    .map((i): Candidato => {
      const barrio = estadisticas.get(i.zonaPath);
      const usarBarrio = i.zonaPath.includes("/") && barrio && barrio.n >= MUESTRA_MINIMA && barrio.medianaM2;
      const est = usarBarrio ? barrio : estadisticas.get(municipio(i.zonaPath));
      const frente = i.precio && i.superficie && est?.medianaM2 ? new Decimal(i.precio).div(i.superficie).minus(est.medianaM2).div(est.medianaM2).mul(100).toDecimalPlaces(0).toNumber() : null;
      const cumplidos = deseables.filter((c) => i.rasgos.some((r) => r.campo === c && r.status === "confirmado"));
      const probables = deseables.filter((c) => i.rasgos.some((r) => r.campo === c && r.status === "probable"));
      const sobre = f.precioMax && i.precio && i.precio > f.precioMax ? new Decimal(i.precio).minus(f.precioMax).div(f.precioMax).mul(100).toDecimalPlaces(1).toNumber() : null;
      const dias = Math.max(0, (ahora - Date.parse(i.publicadoEn)) / 86_400_000);
      const puntos =
        w.precio * (frente === null ? 0 : Math.max(-1, Math.min(1, -frente / 25))) +
        w.deseables * (deseables.length ? (cumplidos.length + probables.length * 0.5) / deseables.length : 0) +
        w.frescura * Math.max(0, 1 - dias / 90) +
        w.espacio * Math.min(1, (i.superficie ?? 0) / 150) -
        (sobre ?? 0) / 10 +
        Object.entries(f.pesos).reduce((acc, [campo, peso]) => acc + (i.rasgos.some((r) => r.campo === campo) ? peso : 0), 0);
      return { i, puntos: Math.round(puntos * 1000) / 1000, sobrePresupuesto: sobre, frenteZona: frente, zonaComparada: frente === null ? null : usarBarrio ? i.zonaNombre : i.municipioNombre, deseablesCumplidos: cumplidos, deseablesProbables: probables };
    })
    .sort((a, b) => b.puntos - a.puntos || a.i.ref.localeCompare(b.i.ref));
}

export function recomendar(todos: InmuebleResumen[], ficha: FichaBusqueda, n = 12): ResultadoRecomendacion {
  const stats = new Map<string, EstadisticaZona>();
  for (const m of new Set(todos.flatMap((i) => [municipio(i.zonaPath), i.zonaPath]))) stats.set(m, estadisticaZona(m, todos, ficha.operacion ?? "venta"));
  let efectiva = ficha;
  let lista = filtrar(todos, efectiva);
  const relajaciones: ResultadoRecomendacion["relajaciones"] = [];
  for (const r of ORDEN_RELAJACION) {
    if (lista.length > 0) break;
    const siguiente = relajar(efectiva, r);
    if (!siguiente) continue;
    efectiva = siguiente;
    lista = filtrar(todos, efectiva);
    relajaciones.push({ tipo: r, total: lista.length });
  }
  const candidatos = preordenar(lista, efectiva, stats);
  return { candidatos: candidatos.slice(0, n), total: lista.length, relajaciones, fichaEfectiva: efectiva };
}

export const nombreZona = (path: string) => zona(path)?.nombre ?? path;
