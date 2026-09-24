import { describe, expect, it } from "vitest";
import { encontrarCantidades, parseCifra, parsePalabras } from "./numeros";

const n = (s: string) => parseCifra(s)?.valor.toString();

describe("parseCifra", () => {
  it.each([
    ["250000", "250000"],
    ["250.000", "250000"],
    ["1.250.000", "1250000"],
    ["1.250.000,50", "1250000.5"],
    ["1,250,000.50", "1250000.5"],
    ["85,5", "85.5"],
    ["1.5", "1.5"],
    ["0,75", "0.75"],
    ["1,250,000", "1250000"],
  ])("%s → %s", (entrada, esperado) => expect(n(entrada)).toBe(esperado));

  it("«1,500» es ambiguo: 1,5 o 1500", () => {
    const r = parseCifra("1,500")!;
    expect(r.valor.toString()).toBe("1.5");
    expect(r.alternativa?.toString()).toBe("1500");
  });

  it("rechaza formas imposibles", () => {
    for (const malo of ["1..5", "1,", "12.34.5", "1.2,3,4"]) expect(parseCifra(malo)).toBeNull();
  });
});

describe("parsePalabras", () => {
  it.each([
    ["doscientos cincuenta mil", 250000],
    ["un millón doscientos mil", 1200000],
    ["medio millón", 500000],
    ["ciento veinte mil", 120000],
    ["tres", 3],
    ["noventa y cinco mil", 95000],
    ["dos millones", 2000000],
    ["veintidós", 22],
    ["mil quinientos", 1500],
  ])("%s → %i", (entrada, esperado) => expect(parsePalabras(entrada)).toBe(esperado));

  it("no confunde palabras que no son números", () => {
    expect(parsePalabras("piso bonito")).toBeNull();
    expect(parsePalabras("y")).toBeNull();
  });
});

describe("encontrarCantidades", () => {
  const vals = (t: string) => encontrarCantidades(t).map((c) => c.valor.toString());

  it("multiplicadores", () => {
    expect(vals("busco hasta 250k")).toEqual(["250000"]);
    expect(vals("presupuesto 1,2 M€")).toEqual(["1200000"]);
    expect(vals("unos 250 mil euros")).toEqual(["250000"]);
    expect(vals("1,5 millones")).toEqual(["1500000"]);
  });

  it("«m» de metros no es millón", () => {
    expect(vals("piso de 90 m2 por 180.000 €")).toEqual(["90", "180000"]);
    expect(vals("parcela de 500 m²")).toEqual(["500"]);
  });

  it("números en palabras dentro de una frase", () => {
    expect(vals("vendo por doscientos cincuenta mil euros, tres dormitorios")).toEqual(["250000", "3"]);
  });

  it("el artículo «un» solo no es una cantidad", () => {
    expect(vals("un piso con terraza")).toEqual([]);
    expect(vals("un millón")).toEqual(["1000000"]);
  });

  it("guarda el literal y la posición", () => {
    const [c] = encontrarCantidades("Precio: 235.000 €");
    expect(c).toMatchObject({ literal: "235.000", inicio: 8, fin: 15 });
  });
});
