import { describe, expect, it } from "vitest";
import { alternativas, resolverRuta, ruta, SEGMENTOS, LOCALES } from "./config";

describe("rutas localizadas", () => {
  it("construye URLs públicas limpias", () => {
    expect(ruta("es")).toBe("/");
    expect(ruta("en")).toBe("/en");
    expect(ruta("es", "venta", "murcia", "centro")).toBe("/venta/murcia/centro");
    expect(ruta("en", "venta", "murcia")).toBe("/en/sale/murcia");
    expect(ruta("en", "cuenta", "entrar")).toBe("/en/account/sign-in");
    expect(ruta("es", "legal", "privacidad")).toBe("/legal/privacidad");
  });

  it("resuelve rutas públicas a internas", () => {
    expect(resolverRuta("/")).toEqual({ tipo: "reescribir", destino: "/es", locale: "es" });
    expect(resolverRuta("/venta/murcia/centro/piso-3-hab-ref-1234")).toEqual({ tipo: "reescribir", destino: "/es/venta/murcia/centro/piso-3-hab-ref-1234", locale: "es" });
    expect(resolverRuta("/en/sale/murcia")).toEqual({ tipo: "reescribir", destino: "/en/venta/murcia", locale: "en" });
    expect(resolverRuta("/en/account/sign-in")).toEqual({ tipo: "reescribir", destino: "/en/cuenta/entrar", locale: "en" });
  });

  it("una sola URL canónica: redirige prefijo por defecto y slugs de otro idioma", () => {
    expect(resolverRuta("/es/venta")).toEqual({ tipo: "redirigir", destino: "/venta" });
    expect(resolverRuta("/es")).toEqual({ tipo: "redirigir", destino: "/" });
    expect(resolverRuta("/en/venta/murcia")).toEqual({ tipo: "redirigir", destino: "/en/sale/murcia" });
    expect(resolverRuta("/sale")).toEqual({ tipo: "redirigir", destino: "/venta" });
  });

  it("ida y vuelta para todos los segmentos e idiomas", () => {
    for (const locale of LOCALES)
      for (const seg of Object.keys(SEGMENTOS)) {
        const r = resolverRuta(ruta(locale, seg));
        expect(r).toMatchObject({ tipo: "reescribir", destino: `/${locale}/${seg}` });
      }
  });

  it("hreflang con x-default", () => {
    expect(alternativas("https://x.es", "venta")).toEqual({ "es-ES": "https://x.es/venta", "en-GB": "https://x.es/en/sale", "x-default": "https://x.es/venta" });
  });
});

describe("zonas con nombre de sección", () => {
  it("el segundo segmento de /venta no se traduce", () => {
    expect(resolverRuta("/venta/contacto")).toEqual({ tipo: "reescribir", destino: "/es/venta/contacto", locale: "es" });
    expect(ruta("en", "venta", "contacto")).toBe("/en/sale/contacto");
  });
});
