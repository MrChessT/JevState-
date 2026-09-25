import { describe, expect, it } from "vitest";
import { NOMBRE_VISIBLE } from "@/config/brand";
import { diccionario, t } from "./diccionario";
import { LOCALES } from "./config";

function hojas(obj: unknown, path = ""): Array<[string, string]> {
  if (typeof obj === "string") return [[path, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => hojas(v, `${path}[${i}]`));
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => hojas(v, path ? `${path}.${k}` : k));
  return [];
}

describe("diccionarios", () => {
  it("todos los idiomas tienen las mismas claves y ningún texto vacío", async () => {
    const [base, ...otros] = await Promise.all(LOCALES.map(diccionario));
    const claves = hojas(base).map(([k]) => k);
    for (const d of otros) expect(hojas(d).map(([k]) => k)).toEqual(claves);
    for (const d of [base, ...otros]) for (const [k, v] of hojas(d)) expect(v.trim(), k).not.toBe("");
  });

  it("las variables coinciden entre idiomas", async () => {
    const [es, en] = await Promise.all(LOCALES.map(diccionario));
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const enMap = new Map(hojas(en));
    for (const [k, v] of hojas(es)) expect(vars(enMap.get(k)!), k).toBe(vars(v));
  });

  it("interpola variables y la marca", () => {
    expect(t("Hola {nombre}, soy {marca}", { nombre: "Ana" })).toBe(`Hola Ana, soy ${NOMBRE_VISIBLE}`);
    expect(t("Sin {variable}")).toBe("Sin {variable}");
  });
});
