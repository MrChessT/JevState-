import { describe, expect, it } from "vitest";
import { extraerMenciones } from "./caracteristicas";
import { extraerAseos, extraerBanos, extraerDormitorios } from "./estancias";
import { aAnual, aMensual, extraerImportes } from "./importes";
import { extraerPlanta } from "./planta";
import { distanciaEnMetros, extraerProximidad } from "./proximidad";
import { extraerSuperficies } from "./superficies";
import { extraerCertificado, extraerReferenciaCatastral, normalizarDireccion, parseFecha } from "./varios";
import Decimal from "decimal.js";

const importes = (t: string) => extraerImportes(t).map((i) => [i.valor.toString(), i.contexto, i.periodo]);

describe("importes", () => {
  it("precio con moneda en varias formas", () => {
    expect(importes("Precio: 250.000 €")).toEqual([["250000", "precio", "unico"]]);
    expect(importes("Se vende por 250k€")).toEqual([["250000", "precio", "unico"]]);
    expect(importes("Vendo por doscientos cincuenta mil euros")).toEqual([["250000", "precio", "unico"]]);
    expect(importes("€ 185.000")).toEqual([["185000", "precio", "unico"]]);
  });

  it("distingue comunidad, IBI, fianza, precio anterior y €/m²", () => {
    const t = "Precio 235.000 € (antes 250.000 €). Comunidad 60 €/mes. IBI 420 € al año. Fianza 1.700 €. Sale a 2.100 €/m².";
    expect(importes(t)).toEqual([
      ["235000", "precio", "unico"],
      ["250000", "precio_anterior", "unico"],
      ["60", "comunidad", "mes"],
      ["420", "ibi", "año"],
      ["1700", "fianza", "unico"],
      ["2100", "precio_m2", "unico"],
    ]);
  });

  it("alquiler mensual", () => {
    expect(importes("Alquiler: 850 €/mes")).toEqual([["850", "precio", "mes"]]);
  });

  it("gastos trimestrales pasan a mensuales", () => {
    const [c] = extraerImportes("Gastos de comunidad: 180 € trimestrales");
    expect(c!.periodo).toBe("trimestre");
    expect(aMensual(c!.valor, c!.periodo).toString()).toBe("60");
    expect(aAnual(new Decimal(35), "mes").toString()).toBe("420");
  });

  it("no toma metros, habitaciones ni años como importes", () => {
    expect(importes("Piso de 90 m² con 3 habitaciones construido en 1998")).toEqual([]);
  });

  it("cifra sin moneda solo con contexto de precio explícito", () => {
    expect(importes("precio 250.000")).toEqual([["250000", "precio", "unico"]]);
    expect(importes("calle Mayor 250")).toEqual([]);
  });
});

describe("superficies", () => {
  const sup = (t: string) => extraerSuperficies(t).map((s) => [s.m2.toString(), s.tipo]);
  it.each([
    ["Piso de 90 m²", [["90", "desconocida"]]],
    ["85m2 útiles", [["85", "util"]]],
    ["120 metros cuadrados construidos", [["120", "construida"]]],
    ["parcela de 500 m2", [["500", "parcela"]]],
    ["finca de 2 ha", [["20000", "parcela"]]],
    ["85 m² útiles y 100 construidos", [["85", "util"], ["100", "construida"]]],
    ["85 m² construidos, parcela de 500 m²", [["85", "construida"], ["500", "parcela"]]],
    ["terraza de 20 m²", [["20", "terraza"]]],
    ["85,5 m2", [["85.5", "desconocida"]]],
  ])("%s", (t, esperado) => expect(sup(t)).toEqual(esperado));
});

describe("habitaciones y baños", () => {
  it.each([
    ["3 habitaciones", 3],
    ["tres dormitorios", 3],
    ["2 hab.", 2],
    ["4 dorm", 4],
    ["2 bedrooms", 2],
  ])("%s → %i dormitorios", (t, n) => expect(extraerDormitorios(t).map((x) => x.n)).toEqual([n]));

  it("baños y aseos por separado", () => {
    expect(extraerBanos("2 baños completos y 1 aseo").map((x) => x.n)).toEqual([2]);
    expect(extraerAseos("2 baños completos y 1 aseo").map((x) => x.n)).toEqual([1]);
    expect(extraerBanos("dos baños").map((x) => x.n)).toEqual([2]);
  });
});

describe("planta", () => {
  const pl = (t: string) => extraerPlanta(t).map((p) => [p.numero, p.tipo]);
  it.each([
    ["Bajo con patio", [[0, "bajo"]]],
    ["planta baja", [[0, "bajo"]]],
    ["entresuelo", [[0, "entresuelo"]]],
    ["Ático con terraza", [[null, "atico"]]],
    ["3ª planta", [[3, "intermedia"]]],
    ["planta 5", [[5, "intermedia"]]],
    ["tercera planta con ascensor", [[3, "intermedia"]]],
    ["planta segunda", [[2, "intermedia"]]],
    ["semisótano", [[-1, "sotano"]]],
    ["última planta", [[null, "ultima"]]],
    ["2º B", [[2, "intermedia"]]],
  ])("%s", (t, esperado) => expect(pl(t)).toEqual(esperado));

  it("«piso de» no es una planta; «bajo precio» no es un bajo", () => {
    expect(pl("un piso de 3 habitaciones a bajo precio")).toEqual([]);
  });
});

describe("certificado, catastro, fechas y direcciones", () => {
  it("certificado energético", () => {
    expect(extraerCertificado("Calificación energética: E").map((c) => c.valor)).toEqual(["e"]);
    expect(extraerCertificado("Certificado energético en trámite").map((c) => c.valor)).toEqual(["en_tramite"]);
    expect(extraerCertificado("CEE: (B)").map((c) => c.valor)).toEqual(["b"]);
    expect(extraerCertificado("Exento de certificado energético").map((c) => c.valor)).toEqual(["exento"]);
  });

  it("referencia catastral", () => {
    expect(extraerReferenciaCatastral("Ref. catastral 9872023 VH5797S 0001 WX").map((r) => r.valor)).toEqual(["9872023VH5797S0001WX"]);
    expect(extraerReferenciaCatastral("PISOCONTERRAZAYASC1234AB")).toEqual([]);
  });

  it("fechas", () => {
    expect(parseFecha("15/03/2024")).toBe("2024-03-15");
    expect(parseFecha("15-03-24")).toBe("2024-03-15");
    expect(parseFecha("2024-03-15T10:00:00Z")).toBe("2024-03-15");
    expect(parseFecha("15 de marzo de 2024")).toBe("2024-03-15");
    expect(parseFecha("31/02/2024")).toBeNull();
  });

  it("direcciones", () => {
    expect(normalizarDireccion("C/ Mayor 5, 3ºB, 30001 Murcia")).toEqual({ via: "Calle Mayor", numero: "5", codigoPostal: "30001", resto: "Murcia" });
    expect(normalizarDireccion("Avda. de la Libertad, 12, Cartagena")).toEqual({ via: "Avenida de la Libertad", numero: "12", codigoPostal: null, resto: "Cartagena" });
    expect(normalizarDireccion("Santiago de la Ribera, San Javier").via).toBeNull();
  });
});

describe("características con negación", () => {
  const m = (t: string) => extraerMenciones(t).map((x) => `${x.negado ? "-" : "+"}${x.rasgo}`);
  it("detecta y niega", () => {
    expect(m("Piso con terraza, sin ascensor y con plaza de garaje")).toEqual(["+terraza", "-ascensor", "+garaje"]);
    expect(m("No tiene trastero. Aire acondicionado por conductos.")).toEqual(["-trastero", "+aire_acondicionado"]);
    expect(m("Ideal inversores: alquilado con inquilino")).toEqual(["+alquilado"]);
    expect(m("Vivienda para reformar")).toEqual(["+a_reformar"]);
  });
});

describe("proximidad", () => {
  it("conceptos y distancias explícitas", () => {
    const r = extraerProximidad("Busco algo cerca de la playa y a 10 minutos andando del colegio");
    expect(r.map((x) => x.concepto)).toEqual(["playa", "colegio"]);
    expect(r[1]!.distancia).toEqual({ valor: 10, unidad: "min" });
    expect(distanciaEnMetros(r[1]!.distancia!)).toBe(800);
    expect(extraerProximidad("near the beach and a school").map((x) => x.concepto)).toEqual(["playa", "colegio"]);
    expect(extraerProximidad("mudanza en marzo")).toEqual([]);
  });
});
