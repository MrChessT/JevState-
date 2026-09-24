// Importación de POI desde OpenStreetMap (Overpass). Datos abiertos (ODbL): se cita la fuente.
// La descarga se hace con `npm run poi:importar` donde haya red; aquí solo la consulta y el parser.
import { uuidDe } from "@/jev/stable";
import type { CategoriaPoi, Poi } from "./indice";

/** Filtros OSM por categoría. */
export const FILTROS_OSM: Record<CategoriaPoi, string[]> = {
  playa: ['nwr["natural"="beach"]'],
  colegio: ['nwr["amenity"="school"]', 'nwr["amenity"="kindergarten"]'],
  transporte: ['nwr["railway"="station"]', 'nwr["railway"="tram_stop"]', 'node["highway"="bus_stop"]'],
  sanidad: ['nwr["amenity"="hospital"]', 'nwr["amenity"="clinic"]', 'nwr["healthcare"="centre"]'],
  comercio: ['nwr["shop"="supermarket"]', 'nwr["shop"="mall"]'],
};

/** Consulta Overpass para la Región de Murcia (ISO 3166-2 ES-MU). */
export function consultaOverpass(categorias: CategoriaPoi[] = Object.keys(FILTROS_OSM) as CategoriaPoi[]): string {
  const partes = categorias.flatMap((c) => FILTROS_OSM[c].map((f) => `${f}(area.r);`));
  return `[out:json][timeout:180];area["ISO3166-2"="ES-MU"][admin_level=4]->.r;(${partes.join("")});out center tags;`;
}

interface ElementoOsm {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function categoriaDe(tags: Record<string, string>): { categoria: CategoriaPoi; sub: string } | null {
  if (tags.natural === "beach") return { categoria: "playa", sub: "beach" };
  if (tags.amenity === "school" || tags.amenity === "kindergarten") return { categoria: "colegio", sub: tags.amenity };
  if (tags.railway === "station" || tags.railway === "tram_stop") return { categoria: "transporte", sub: tags.railway };
  if (tags.highway === "bus_stop") return { categoria: "transporte", sub: "bus_stop" };
  if (tags.amenity === "hospital" || tags.amenity === "clinic" || tags.healthcare === "centre") return { categoria: "sanidad", sub: tags.amenity ?? "centre" };
  if (tags.shop === "supermarket" || tags.shop === "mall") return { categoria: "comercio", sub: tags.shop };
  return null;
}

export function parsearOverpass(json: { elements?: ElementoOsm[] }): Array<Poi & { osmId: number }> {
  const out: Array<Poi & { osmId: number }> = [];
  for (const e of json.elements ?? []) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const c = e.tags ? categoriaDe(e.tags) : null;
    if (lat === undefined || lon === undefined || !c) continue;
    // Id de OSM único por tipo: node/way/relation se codifican en el signo y el desplazamiento.
    const osmId = e.type === "node" ? e.id : e.type === "way" ? -e.id : -(e.id + 10_000_000_000);
    out.push({ id: uuidDe(`osm:${e.type}:${e.id}`), osmId, categoria: c.categoria, subcategoria: c.sub, nombre: e.tags?.name ?? null, lat, lon });
  }
  return out;
}
