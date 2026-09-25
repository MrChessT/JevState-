import { describe, expect, it } from "vitest";
import { extraer } from "./extraer";
import { heredar, fichaVacia } from "./ficha";

describe("extracción del mensaje", () => {
  it("cifras con pista, zonas con erratas, requisitos y proximidad", () => {
    const e = extraer("Busco un piso de 3 habitaciones en cartajena hasta 200.000 € con terraza, sin bajos y cerca de la playa");
    expect(e.cifras.map((c) => [c.valor.toString(), c.pista])).toEqual([["200000", "maximo"]]);
    expect(e.zonas[0]!.candidatas[0]!.zona.path).toBe("cartagena");
    expect(e.habitaciones).toBe(3);
    expect(e.tipos).toEqual(["piso"]);
    expect(e.requisitos.map((r) => r.campo)).toContain("terraza");
    expect(e.proximidad.map((p) => p.concepto)).toEqual(["playa"]);
  });

  it("«unos 250» en compra se lee como 250 mil (candidato; decide Jev)", () => {
    expect(extraer("tengo unos 250 para comprar").cifras.map((c) => [c.valor.toString(), c.pista])).toEqual([["250000", "aproximado"]]);
    expect(extraer("alquiler hasta 800 al mes").cifras.map((c) => c.valor.toString())).toEqual(["800"]);
  });

  it("operación, referencias, ordinales y perfil declarado", () => {
    const e = extraer("¿el segundo tiene ascensor? me interesa también FIC-0012 para vivir con mis hijos");
    expect(e.inmuebles).toMatchObject({ refs: ["FIC-0012"], ordinal: 2 });
    expect(e.perfilDeclarado).toBe(true);
    expect(extraer("quiero alquilar en Murcia").operacion).toBe("alquiler");
  });
});

describe("ficha de búsqueda", () => {
  it("hereda lo que el mensaje no dice", () => {
    const a = heredar(fichaVacia(), { zonas: ["murcia"], precioMax: 200000, requisitos: { terraza: "imprescindible" } });
    const b = heredar(a, { requisitos: { garaje: "imprescindible" } });
    expect(b).toMatchObject({ zonas: ["murcia"], precioMax: 200000, requisitos: { terraza: "imprescindible", garaje: "imprescindible" } });
  });
});
