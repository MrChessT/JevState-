import { describe, expect, it } from "vitest";
import { hashContenido } from "@/ingesta/tipos";
import { parsearFeedXml } from "@/ingesta/xml-portales";
import { feedXml, generarConjunto } from "./generador";

describe("inmuebles ficticios", () => {
  const conjunto = generarConjunto(300);

  it("300, deterministas, con ref FIC- y marcados como ficticios", () => {
    expect(conjunto).toHaveLength(300);
    expect(new Set(conjunto.map((i) => i.ref)).size).toBe(300);
    expect(conjunto.every((i) => i.ref.startsWith("FIC-"))).toBe(true);
    expect(generarConjunto(300).map((i) => i.xml)).toEqual(conjunto.map((i) => i.xml));
    const registros = parsearFeedXml(feedXml(conjunto), { adaptador: "ficticios", ficticio: true });
    expect(registros).toHaveLength(300);
    expect(registros.every((r) => r.ficticio && /ficticio/i.test(r.descripcion.es ?? ""))).toBe(true);
    expect(feedXml(conjunto)).toContain("DATOS FICTICIOS");
    // Mismo contenido → mismo hash (la ingesta es idempotente también con los ficticios).
    expect(hashContenido(parsearFeedXml(feedXml(conjunto), { adaptador: "ficticios", ficticio: true })[0]!)).toBe(hashContenido(registros[0]!));
  });

  it("cubre todas las ambigüedades pedidas", () => {
    const vistos = new Set(conjunto.flatMap((i) => i.escenarios));
    for (const e of ["precio_rebajado", "precio_rebajado_feed_desactualizado", "jsonld_desactualizado", "terraza_solo_texto", "para_reformar", "garaje_opcional", "comunidad_trimestral", "sin_ascensor", "alquilado_con_inquilino", "vpo", "okupado", "nuda_propiedad", "subasta", "util_y_construida", "precio_en_palabras", "certificado_en_tramite"])
      expect(vistos, e).toContain(e);
  });

  it("zonas, operaciones y tipos variados", () => {
    expect(new Set(conjunto.map((i) => i.verdad.zona)).size).toBeGreaterThan(40);
    expect(new Set(conjunto.map((i) => i.verdad.operacion))).toEqual(new Set(["venta", "alquiler", "alquiler_vacacional"]));
    expect(new Set(conjunto.map((i) => i.verdad.tipo)).size).toBeGreaterThanOrEqual(8);
  });
});
