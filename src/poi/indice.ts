// Puntos de interés y distancias por inmueble (sección 2.1: colegios, playa, transporte, sanidad y
// comercio). Índice en rejilla para buscar el más cercano sin recorrer todos los puntos.
import { distanciaMetros, minutosAndando, type Punto } from "@/geo/distancia";

export const CATEGORIAS_POI = ["playa", "colegio", "transporte", "sanidad", "comercio"] as const;
export type CategoriaPoi = (typeof CATEGORIAS_POI)[number];

export interface Poi extends Punto {
  id: string;
  categoria: CategoriaPoi;
  nombre: string | null;
  subcategoria?: string;
}

/** Radio máximo en el que se busca cada categoría (más allá no se muestra distancia). */
export const RADIO_MAX: Record<CategoriaPoi, number> = { playa: 30_000, colegio: 5_000, transporte: 3_000, sanidad: 15_000, comercio: 5_000 };
/** Cuántos de cada categoría se guardan por inmueble. */
export const POR_CATEGORIA = 3;

const CELDA = 0.05; // ~5 km

export interface DistanciaPoi {
  poi_id: string;
  category: CategoriaPoi;
  nombre: string | null;
  distance_m: number;
  walk_min: number;
}

export class IndicePoi {
  readonly #celdas = new Map<string, Poi[]>();
  readonly size: number;

  constructor(pois: Poi[]) {
    for (const p of pois) {
      const k = this.clave(p.lat, p.lon);
      this.#celdas.set(k, [...(this.#celdas.get(k) ?? []), p]);
    }
    this.size = pois.length;
  }

  private clave(lat: number, lon: number): string {
    return `${Math.floor(lat / CELDA)}:${Math.floor(lon / CELDA)}`;
  }

  /** Los n más cercanos de una categoría dentro de maxMetros. */
  cercanos(p: Punto, categoria: CategoriaPoi, n = POR_CATEGORIA, maxMetros = RADIO_MAX[categoria]): DistanciaPoi[] {
    const radioCeldas = Math.ceil(maxMetros / 111_000 / CELDA) + 1;
    const [cy, cx] = [Math.floor(p.lat / CELDA), Math.floor(p.lon / CELDA)];
    const encontrados: DistanciaPoi[] = [];
    for (let dy = -radioCeldas; dy <= radioCeldas; dy++) {
      for (let dx = -radioCeldas; dx <= radioCeldas; dx++) {
        for (const poi of this.#celdas.get(`${cy + dy}:${cx + dx}`) ?? []) {
          if (poi.categoria !== categoria) continue;
          const d = distanciaMetros(p, poi);
          if (d <= maxMetros) encontrados.push({ poi_id: poi.id, category: categoria, nombre: poi.nombre, distance_m: d, walk_min: minutosAndando(d) });
        }
      }
    }
    return encontrados.sort((a, b) => a.distance_m - b.distance_m).slice(0, n);
  }

  distancias(p: Punto): DistanciaPoi[] {
    return CATEGORIAS_POI.flatMap((c) => this.cercanos(p, c));
  }
}
