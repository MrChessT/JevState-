import { describe, expect, it } from "vitest";
import { recommend, sweep } from "./sweep";

describe("barrido de umbrales", () => {
  const decisions = [
    { gate: "zona", value: 0.95, correct: true },
    { gate: "zona", value: 0.9, correct: true },
    { gate: "zona", value: 0.72, correct: true },
    { gate: "zona", value: 0.6, correct: false },
    { gate: "zona", value: 0.4, correct: false },
  ];

  it("calcula cobertura y precisión por umbral", () => {
    const rows = sweep(decisions, [0.5, 0.7, 0.9]).get("zona")!;
    expect(rows[0]).toMatchObject({ act: 0.5, coverage: 0.8, precision: 0.75 });
    expect(rows[1]).toMatchObject({ act: 0.7, coverage: 0.6, precision: 1 });
    expect(rows[2]).toMatchObject({ act: 0.9, coverage: 0.4, precision: 1 });
  });

  it("recomienda el umbral más bajo que mantiene la precisión", () => {
    expect(recommend(sweep(decisions, [0.5, 0.7, 0.9]).get("zona")!, 0.98)).toBe(0.7);
  });

  it("invierte las alarmas (sí = malo)", () => {
    const rows = sweep([{ gate: "inyeccion", value: 0.1, correct: true, inverted: true }], [0.8]).get("inyeccion")!;
    expect(rows[0]!.coverage).toBe(1);
  });
});
