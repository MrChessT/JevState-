import type { SupabaseClient } from "@supabase/supabase-js";
import { POR_PAGINA } from "./filtros";
import type { RepositorioPortal, ResultadoBusqueda } from "./repositorio";
import type { EstadisticaZona, InmuebleFicha, InmuebleResumen } from "./tipos";

/** Portal contra Supabase con la clave anónima: RLS limita a publicados y campos públicos. */
export function repoSupabase(db: SupabaseClient): RepositorioPortal {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };
  const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  const resumen = (r: InmuebleResumen): InmuebleResumen => ({ ...r, precio: num(r.precio), precioAnterior: num(r.precioAnterior), superficie: num(r.superficie) });
  const buscar = async (f: Parameters<RepositorioPortal["buscar"]>[0]) => {
    const r = await rpc<ResultadoBusqueda>("buscar_inmuebles", { f: { ...f, porPagina: POR_PAGINA } });
    return { ...r, items: r.items.map(resumen) };
  };
  return {
    buscar,
    async ficha(operacion, slug) {
      const r = await rpc<InmuebleFicha | null>("ficha_inmueble", { p_operacion: operacion, p_slug: slug });
      return r ? { ...r, ...resumen(r) } : null;
    },
    async similares(i, n = 4) {
      const r = await buscar({ operacion: i.operacion === "venta" ? "venta" : "alquiler", zona: i.zonaPath.split("/")[0], tipos: [], con: [], orden: "recientes", pagina: 1 });
      return r.items.filter((x) => x.ref !== i.ref).slice(0, n);
    },
    async destacados(n = 6) {
      return (await buscar({ operacion: "venta", tipos: [], con: [], orden: "recientes", pagina: 1 })).items.slice(0, n);
    },
    async estadistica(path, operacion) {
      // Calculada en SQL con toda la muestra de la zona (estadistica_zona, migración 0011).
      return rpc<EstadisticaZona>("estadistica_zona", { p_path: path, p_operacion: operacion });
    },
    async todas() {
      // Una sola llamada (inmuebles_publicados, migración 0011).
      return (await rpc<InmuebleResumen[]>("inmuebles_publicados", {})).map(resumen);
    },
    async porRefs(refs) {
      return refs.length ? (await rpc<InmuebleResumen[]>("inmuebles_por_ref", { p_refs: refs.slice(0, 50) })).map(resumen) : [];
    },
    async fichasPorRef(refs) {
      return refs.length ? (await rpc<InmuebleFicha[]>("fichas_por_ref", { p_refs: refs.slice(0, 3) })).map((r) => ({ ...r, ...resumen(r) })) : [];
    },
  };
}
