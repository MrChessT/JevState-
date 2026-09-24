import { describe, expect, it } from "vitest";
import { IndicePoi, type Poi } from "./indice";
import { consultaOverpass, parsearOverpass } from "./osm";

const pois: Poi[] = [
  { id: "a", categoria: "playa", nombre: "Playa de los Alcázares", lat: 37.744, lon: -0.846 },
  { id: "b", categoria: "playa", nombre: "Playa lejana", lat: 37.9, lon: -0.7 },
  { id: "c", categoria: "colegio", nombre: "CEIP", lat: 37.7445, lon: -0.852 },
  { id: "d", categoria: "colegio", nombre: "Colegio lejano", lat: 37.9, lon: -1.2 },
];

describe("índice de POI", () => {
  const idx = new IndicePoi(pois);
  it("el más cercano por categoría, dentro del radio", () => {
    const d = idx.distancias({ lat: 37.7442, lon: -0.8505 });
    expect(d.filter((x) => x.category === "playa").map((x) => x.poi_id)).toEqual(["a", "b"]);
    expect(d.filter((x) => x.category === "colegio").map((x) => x.poi_id)).toEqual(["c"]);
    expect(d[0]!.distance_m).toBeGreaterThan(300);
    expect(d[0]!.distance_m).toBeLessThan(500);
    expect(d[0]!.walk_min).toBe(Math.ceil(d[0]!.distance_m / 80));
  });
});

describe("OpenStreetMap", () => {
  it("consulta para la Región de Murcia", () => {
    const q = consultaOverpass(["playa"]);
    expect(q).toContain('area["ISO3166-2"="ES-MU"]');
    expect(q).toContain('nwr["natural"="beach"](area.r);');
  });

  it("parser: nodos, vías con centro, y descarta lo que no es de ninguna categoría", () => {
    const r = parsearOverpass({
      elements: [
        { type: "node", id: 1, lat: 37.6, lon: -0.9, tags: { highway: "bus_stop", name: "Parada" } },
        { type: "way", id: 2, center: { lat: 37.7, lon: -0.8 }, tags: { natural: "beach", name: "Playa" } },
        { type: "node", id: 3, lat: 37.7, lon: -0.8, tags: { amenity: "bench" } },
      ],
    });
    expect(r.map((p) => [p.categoria, p.nombre, p.osmId])).toEqual([
      ["transporte", "Parada", 1],
      ["playa", "Playa", -2],
    ]);
    expect(parsearOverpass({ elements: [{ type: "node", id: 1, lat: 1, lon: 1, tags: { highway: "bus_stop" } }] })[0]!.id).toBe(r[0]!.id);
  });
});
