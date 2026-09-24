import { describe, expect, it } from "vitest";
import { esSlugFicha, leerFiltros, tieneFiltros, urlFicha, urlFiltros } from "./filtros";
import { calcularHipoteca } from "./hipoteca";
import { estadisticaZona, frenteAZona } from "./estadisticas";
import type { InmuebleResumen } from "./tipos";

describe("filtros ⇄ URL", () => {
  it("lee, limpia lo inválido y escribe la URL canónica", () => {
    const f = leerFiltros("venta", ["murcia", "el-carmen"], { precio_max: "250000", hab_min: "3", tipo: "piso,castillo", con: "terraza", orden: "raro", pagina: "-1" });
    expect(f).toMatchObject({ zona: "murcia/el-carmen", precioMax: 250000, habMin: 3, tipos: ["piso"], con: ["terraza"], orden: "recientes", pagina: 1 });
    expect(urlFiltros("es", f)).toBe("/venta/murcia/el-carmen?precio_max=250000&hab_min=3&tipo=piso&con=terraza");
    expect(urlFiltros("en", f, { pagina: 2 })).toBe("/en/sale/murcia/el-carmen?precio_max=250000&hab_min=3&tipo=piso&con=terraza&pagina=2");
    expect(tieneFiltros(f)).toBe(true);
    expect(tieneFiltros(leerFiltros("alquiler", undefined, {}))).toBe(false);
  });

  it("URL de ficha y detección de slug", () => {
    expect(urlFicha("es", { operacion: "venta", zonaPath: "murcia/centro", slug: "piso-3-hab-ref-fic-0001" })).toBe("/venta/murcia/centro/piso-3-hab-ref-fic-0001");
    expect(esSlugFicha("piso-3-hab-ref-fic-0001")).toBe(true);
    expect(esSlugFicha("el-carmen")).toBe(false);
  });
});

describe("hipoteca orientativa", () => {
  it("cuota francesa con decimal.js", () => {
    const r = calcularHipoteca({ precio: "200000", entradaPct: "20", interesAnual: "3", anos: 30 });
    expect(r.prestamo).toBe("160000");
    expect(r.cuotaMensual).toBe("674.57");
    expect(r.ahorroNecesario).toBe("60000");
  });
  it("interés 0", () => {
    expect(calcularHipoteca({ precio: "120000", entradaPct: "0", interesAnual: "0", anos: 10 }).cuotaMensual).toBe("1000.00");
  });
});

describe("estadísticas de zona", () => {
  const base = { id: "", ref: "", slug: "", tipo: "piso", titulo: "", zonaNombre: "", municipioNombre: "", precioAnterior: null, habitaciones: 2, banos: 1, lat: null, lon: null, foto: null, rasgos: [], publicadoEn: "", ficticio: true };
  const i = (zonaPath: string, precio: number, superficie: number): InmuebleResumen => ({ ...base, tipo: "piso", operacion: "venta", zonaPath, precio, superficie });
  it("mediana €/m² del municipio con sus barrios; mínimo 3", () => {
    const xs = [i("murcia/centro", 200000, 100), i("murcia", 150000, 100), i("murcia/el-carmen", 100000, 100), i("lorca", 50000, 100)];
    expect(estadisticaZona("murcia", xs, "venta")).toMatchObject({ n: 3, medianaM2: "1500" });
    expect(estadisticaZona("lorca", xs, "venta").medianaM2).toBeNull();
    expect(frenteAZona(135000, 100, "1500")).toBe(-10);
  });
});
