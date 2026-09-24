import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_VERSION, field, filterableFields } from "./index";
import { CATALOG_VERSION as GENERATED_VERSION } from "./generated";
import { ASSISTANT_CATALOG_HASH, hashActual } from "@/asistente/version";

describe("catálogo compilado", () => {
  it("está al día con los tipos generados", () => {
    expect(CATALOG_VERSION).toBe(GENERATED_VERSION);
  });

  it("los campos legales de alto impacto exigen más confianza", () => {
    for (const id of ["okupado", "nuda_propiedad", "subasta", "vpo"]) expect(field(id).gate.act).toBeGreaterThanOrEqual(0.9);
  });

  it("la rentabilidad declarada es solo evidencia (no pública)", () => {
    expect(field("rentabilidad_declarada").public).toBe(false);
    expect(filterableFields().some((f) => f.id === "rentabilidad_declarada")).toBe(false);
  });

  it("los textos nunca se generan (sin pregunta a Jev)", () => {
    for (const f of CATALOG.fields.filter((x) => x.type === "text")) expect(f.question).toBeUndefined();
  });
});

describe("catálogo del asistente", () => {
  it("cualquier cambio de texto obliga a subir la versión (npm run catalog:compile)", () => {
    expect(hashActual()).toBe(ASSISTANT_CATALOG_HASH);
  });
});
