import { describe, expect, it } from "vitest";
import { BRAND } from "@/config/brand";
import { contraste, textoSobre } from "./color";

describe("contraste", () => {
  it("valores de referencia", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contraste("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("el texto sobre la marca cumple AA (4,5:1)", () => {
    for (const color of [BRAND.primaryColor, BRAND.accentColor]) expect(contraste(color, textoSobre(color))).toBeGreaterThanOrEqual(4.5);
  });

  it("elige tinta oscura sobre una marca clara", () => {
    expect(textoSobre("#ffd84d")).toBe("#141414");
    expect(textoSobre("#1f4e5f")).toBe("#ffffff");
  });
});
