import type { SupabaseClient } from "@supabase/supabase-js";
import { estadisticaZona } from "./estadisticas";
import { POR_PAGINA } from "./filtros";
import type { RepositorioPortal, ResultadoBusqueda } from "./repositorio";
import type { InmuebleFicha, InmuebleResumen } from "./tipos";

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
      // Con volumen real se pasa a una vista materializada; con una agencia basta calcularlo aquí.
      const r = await rpc<ResultadoBusqueda>("buscar_inmuebles", { f: { operacion, zona: path, porPagina: 48, pagina: 1 } });
      return estadisticaZona(path, r.items.map(resumen), operacion);
    },
    async todas() {
      const out: InmuebleResumen[] = [];
      for (const operacion of ["venta", "alquiler"] as const) {
        for (let pagina = 1; pagina < 200; pagina++) {
          const r = await rpc<ResultadoBusqueda>("buscar_inmuebles", { f: { operacion, porPagina: 48, pagina } });
          out.push(...r.items.map(resumen));
          if (r.items.length < 48) break;
        }
      }
      return out;
    },
  };
}
