import { describe, expect, it } from "vitest";
import { leerFiltros } from "./filtros";
import { construirRepoFicticio } from "./repo-memoria";

describe("repositorio de ficticios", async () => {
  const repo = await construirRepoFicticio(80);

  it("busca por operación, zona, precio y requisitos confirmados", async () => {
    const todo = await repo.buscar(leerFiltros("venta", undefined, {}));
    expect(todo.total).toBeGreaterThan(20);
    expect(todo.items).toHaveLength(12);
    const conTerraza = await repo.buscar(leerFiltros("venta", undefined, { con: "terraza" }));
    expect(conTerraza.total).toBeLessThan(todo.total);
    for (const i of conTerraza.items) expect(i.rasgos.some((r) => r.campo === "terraza")).toBe(true);
    const barato = await repo.buscar(leerFiltros("venta", undefined, { precio_max: "150000", orden: "precio_asc" }));
    expect(barato.items.every((i) => (i.precio ?? 0) <= 150000)).toBe(true);
    expect(barato.items.map((i) => i.precio)).toEqual([...barato.items.map((i) => i.precio)].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("ficha por slug y similares de la misma zona", async () => {
    const [i] = (await repo.buscar(leerFiltros("venta", undefined, {}))).items;
    const f = await repo.ficha("venta", i!.slug);
    expect(f?.ref).toBe(i!.ref);
    expect(f?.campos.precio).toBeDefined();
    for (const s of await repo.similares(f!)) expect(s.zonaPath.split("/")[0]).toBe(f!.zonaPath.split("/")[0]);
  });
});
