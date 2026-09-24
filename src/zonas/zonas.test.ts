import { describe, expect, it } from "vitest";
import { distanciaMetros, ubicacionAproximada } from "@/geo/distancia";
import { BARRIOS, MUNICIPIOS } from "./datos";
import { buscarZonas, colindantes, detectarZonas, similitud, ZONAS } from "./buscar";
import { GeocoderLocal, municipioPorCp } from "./geocodificar";

describe("datos de zonas", () => {
  it("45 municipios con INE único 30001-30045", () => {
    expect(MUNICIPIOS).toHaveLength(45);
    expect(new Set(MUNICIPIOS.map((m) => m.ine)).size).toBe(45);
    expect(MUNICIPIOS.map((m) => m.ine).sort()).toEqual(Array.from({ length: 45 }, (_, i) => `300${String(i + 1).padStart(2, "0")}`));
  });

  it("rutas únicas y barrios de municipios existentes, dentro de la región", () => {
    expect(new Set(ZONAS.map((z) => z.path)).size).toBe(ZONAS.length);
    for (const b of BARRIOS) expect(MUNICIPIOS.some((m) => m.slug === b.municipio)).toBe(true);
    for (const z of ZONAS) {
      expect(z.lat).toBeGreaterThan(37.3);
      expect(z.lat).toBeLessThan(38.8);
      expect(z.lon).toBeGreaterThan(-2.4);
      expect(z.lon).toBeLessThan(-0.6);
    }
  });

  it("colindancias simétricas", () => {
    expect(colindantes("los-alcazares")).toContain("san-javier");
    expect(colindantes("san-javier")).toContain("los-alcazares");
  });

  it("cada barrio está cerca de su municipio (coherencia de coordenadas)", () => {
    for (const z of ZONAS.filter((x) => x.nivel === "barrio")) {
      const m = ZONAS.find((x) => x.path === z.municipio)!;
      expect(distanciaMetros(z, m), z.path).toBeLessThan(40_000);
    }
  });
});

describe("búsqueda difusa", () => {
  it.each([
    ["cartajena", "cartagena"],
    ["Cartagena", "cartagena"],
    ["murica", "murcia"],
    ["sn javier", "san-javier"],
    ["torrepacheco", "torre-pacheco"],
    ["alcazares", "los-alcazares"],
    ["mazaron", "mazarron"],
    ["molina", "molina-de-segura"],
    ["lo pagan", "san-pedro-del-pinatar/lo-pagan"],
    ["santiago de la rivera", "san-javier/santiago-de-la-ribera"],
  ])("%s → %s", (q, path) => expect(buscarZonas(q)[0]?.zona.path).toBe(path));

  it("literal solo si coincide exactamente", () => {
    expect(buscarZonas("Cartagena")[0]!.literal).toBe(true);
    expect(buscarZonas("cartagema")[0]!.literal).toBe(false);
    expect(buscarZonas("cartajena")[0]!.literal).toBe(true); // alias registrado
  });

  it("La Manga está en dos municipios: ambas candidatas", () => {
    const paths = buscarZonas("la manga").map((c) => c.zona.path);
    expect(paths).toContain("cartagena/la-manga");
    expect(paths).toContain("san-javier/la-manga");
  });

  it("similitud", () => {
    expect(similitud("cartagena", "cartagena")).toBe(1);
    expect(similitud("cartajena", "cartagena")).toBeGreaterThan(0.85);
    expect(similitud("yecla", "murcia")).toBeLessThan(0.5);
  });
});

describe("detección en texto libre", () => {
  const paths = (t: string) => detectarZonas(t).map((m) => m.candidatas[0]!.zona.path);
  it("encuentra zonas con erratas en una frase", () => {
    expect(paths("busco piso en cartajena o murcia")).toEqual(["cartagena", "murcia"]);
    expect(paths("un ático en Lo Pagán cerca de la playa")).toEqual(["san-pedro-del-pinatar/lo-pagan"]);
    expect(paths("algo en el barrio del Carmen")).toEqual(["murcia/el-carmen"]);
  });

  it("no toma palabras comunes como zonas", () => {
    expect(paths("quiero una casa blanca con buena fortuna")).toEqual([]);
    expect(paths("vivo en Blanca")).toEqual(["blanca"]);
  });
});

describe("geocodificación local", () => {
  const geo = new GeocoderLocal();

  it("municipio del feed + barrio nombrado en la dirección", async () => {
    const r = await geo.geocodificar({ direccion: "Calle Mayor 5, Barrio del Carmen", municipio: "Murcia" });
    expect(r).toMatchObject({ municipio: { path: "murcia" }, barrio: { path: "murcia/el-carmen" }, precision: "barrio" });
  });

  it("coordenadas → barrio más cercano del municipio", async () => {
    const r = await geo.geocodificar({ municipio: "San Javier", lat: 37.7975, lon: -0.8075 });
    expect(r?.barrio?.path).toBe("san-javier/santiago-de-la-ribera");
    expect(r?.precision).toBe("coordenadas");
  });

  it("solo código postal", async () => {
    expect(municipioPorCp("30204")?.path).toBe("cartagena");
    expect(municipioPorCp("30710")?.path).toBe("los-alcazares");
    const r = await geo.geocodificar({ codigoPostal: "30870" });
    expect(r?.municipio.path).toBe("mazarron");
  });

  it("contradicción municipio / código postal baja la confianza", async () => {
    const r = await geo.geocodificar({ municipio: "Murcia", codigoPostal: "30204" });
    expect(r!.confianza).toBeLessThanOrEqual(0.6);
    expect(r!.motivo).toMatch(/Cartagena/);
  });

  it("sin datos → null", async () => {
    expect(await geo.geocodificar({})).toBeNull();
  });
});

describe("ubicación pública aproximada", () => {
  it("determinista y entre 120 y 250 m del punto real", () => {
    const p = { lat: 37.6, lon: -0.98 };
    const a = ubicacionAproximada(p, "ref-1");
    expect(ubicacionAproximada(p, "ref-1")).toEqual(a);
    const d = distanciaMetros(p, a);
    expect(d).toBeGreaterThanOrEqual(115);
    expect(d).toBeLessThanOrEqual(255);
  });
});
