import { describe, expect, it } from "vitest";
import { LimiteFrecuencia } from "./limites";

describe("límite de frecuencia", () => {
  it("deja pasar hasta el máximo por minuto y vuelve a abrir al pasar la ventana", () => {
    const l = new LimiteFrecuencia(3);
    expect([0, 1, 2, 3].map((i) => l.permitir("ip", 1000 + i))).toEqual([true, true, true, false]);
    expect(l.permitir("otra", 1004)).toBe(true);
    expect(l.espera("ip", 1004)).toBe(60);
    expect(l.permitir("ip", 61_001)).toBe(true);
  });

  it("no crece sin límite", () => {
    const l = new LimiteFrecuencia(1, 5);
    for (let i = 0; i < 50; i++) l.permitir(`k${i}`);
    expect((l as unknown as { marcas: Map<string, number[]> }).marcas.size).toBeLessThanOrEqual(5);
  });
});
