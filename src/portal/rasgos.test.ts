import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { condicionSql, esPositivo } from "./rasgos";

describe("rasgos", () => {
  it("solo cuentan los valores positivos", () => {
    expect(esPositivo("exterior", "interior")).toBe(false);
    expect(esPositivo("exterior", "exterior")).toBe(true);
    expect(esPositivo("vistas", "sin_vistas_destacables")).toBe(false);
    expect(esPositivo("garaje", "no_tiene")).toBe(false);
    expect(esPositivo("luminosidad", "muy_luminoso")).toBe(true);
    expect(esPositivo("terraza", false)).toBe(false);
    expect(esPositivo("inventado", true)).toBe(false);
  });

  it("la función SQL es_rasgo coincide con la definición de TypeScript", () => {
    const sql = readFileSync("supabase/migrations/0010_portal_lectura.sql", "utf8");
    const bloque = /-- rasgos:inicio\n([\s\S]*?)\n\s*-- rasgos:fin/.exec(sql)?.[1];
    const norm = (x: string) => x.replace(/\s+/g, " ").trim();
    expect(norm(bloque ?? "")).toBe(norm(condicionSql()));
  });
});
