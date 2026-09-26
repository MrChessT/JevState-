import type { Filtros } from "./filtros";
import type { EstadisticaZona, InmuebleFicha, InmuebleResumen } from "./tipos";

export interface Faceta {
  valor: string;
  n: number;
}

export interface ResultadoBusqueda {
  items: InmuebleResumen[];
  total: number;
  /** Todos los puntos del resultado (para el mapa), no solo la página. */
  puntos: Array<{ ref: string; lat: number; lon: number; precio: number | null }>;
  facetas: { tipos: Faceta[]; zonas: Faceta[] };
}

export interface RepositorioPortal {
  buscar(f: Filtros): Promise<ResultadoBusqueda>;
  ficha(operacion: "venta" | "alquiler", slug: string): Promise<InmuebleFicha | null>;
  similares(i: InmuebleResumen, n?: number): Promise<InmuebleResumen[]>;
  destacados(n?: number): Promise<InmuebleResumen[]>;
  estadistica(path: string, operacion: "venta" | "alquiler"): Promise<EstadisticaZona>;
  /** Toda la oferta publicada (sitemap, asistente, portada). */
  todas(): Promise<InmuebleResumen[]>;
  /** Resúmenes por referencia, en el orden pedido (favoritos). */
  porRefs(refs: string[]): Promise<InmuebleResumen[]>;
  /** Fichas completas por referencia (comparador, máximo 3). */
  fichasPorRef(refs: string[]): Promise<InmuebleFicha[]>;
}
