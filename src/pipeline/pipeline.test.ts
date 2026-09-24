import { describe, expect, it } from "vitest";
import { CATALOG } from "@/catalog/index";
import { hashContenido } from "@/ingesta/tipos";
import { parsearFeedXml } from "@/ingesta/xml-portales";
import { FakeJev } from "@/jev/fake";
import { IndicePoi } from "@/poi/indice";
import { GeocoderLocal } from "@/zonas/geocodificar";
import { AlmacenMemoria } from "./almacen";
import { procesarRegistro, slugInmueble } from "./procesar";

const XML = `<root><property><id>7</id><ref>MU-0007</ref><price>185000</price><price_freq>sale</price_freq><type>apartment</type>
<town>Murcia</town><address>Calle Mayor 5, Barrio del Carmen</address><beds>3</beds><baths>2</baths>
<surface_area><built>90</built></surface_area><location><latitude>37.978</latitude><longitude>-1.13</longitude></location>
<desc><es>Piso reformado con terraza. Contacto: 968 000 111.</es></desc><images><image><url>https://example.com/a.jpg</url></image></images>
</property></root>`;

function deps(almacen = new AlmacenMemoria(), jev = new FakeJev({ responder: (id) => (id === "terraza" ? 0.95 : undefined) })) {
  return {
    jev,
    catalog: CATALOG,
    geocoder: new GeocoderLocal(),
    almacen,
    agencyId: "agencia-1",
    pois: new IndicePoi([{ id: "p1", categoria: "colegio", nombre: "CEIP", lat: 37.979, lon: -1.131 }]),
    limitadores: new Map(),
    reintentos: { intentos: 1, baseMs: 1, maxMs: 1 },
  };
}

describe("pipeline por inmueble", () => {
  const [r] = parsearFeedXml(XML, { adaptador: "crm", capturadoEn: "2026-09-24T10:00:00Z", ficticio: true });
  const hash = hashContenido(r!);

  it("procesa, geocodifica, publica si están los obligatorios y guarda todo", async () => {
    const d = deps();
    const res = await procesarRegistro(r!, hash, d);
    expect(res).toMatchObject({ omitido: false, cambio: true, canonicalVersion: 1, estado: "publicado" });
    const g = [...d.almacen.guardados.values()][0]!.payload;
    expect(g.listing).toMatchObject({ slug: "piso-3-hab-ref-mu-0007", zone_path: "murcia/el-carmen", price: "185000", bedrooms: 3, is_fictitious: true });
    expect(g.fields.find((f) => f.field_id === "zona")).toMatchObject({ value: "murcia/el-carmen", status: "confirmado" });
    expect(g.fields.find((f) => f.field_id === "terraza")).toMatchObject({ value: true, is_public: true });
    expect(g.fields.find((f) => f.field_id === "rentabilidad_declarada")).toMatchObject({ is_public: false });
    expect(g.poi_distances).toHaveLength(1);
    expect(g.media).toEqual([{ url: "https://example.com/a.jpg", position: 0 }]);
    // Ubicación pública desplazada respecto a la exacta (que va a datos privados).
    expect(g.listing.lat).not.toBe(37.978);
    expect(g.private).toMatchObject({ lat: 37.978, lon: -1.13 });
  });

  it("idempotente: mismo hash → no se reprocesa ni se llama a Jev", async () => {
    const d = deps();
    await procesarRegistro(r!, hash, d);
    const llamadas = (d.jev as FakeJev).calls.length;
    const res = await procesarRegistro(r!, hash, d);
    expect(res.omitido).toBe(true);
    expect((d.jev as FakeJev).calls.length).toBe(llamadas);
  });

  it("una corrección manual sobrevive al reproceso", async () => {
    const d = deps();
    await procesarRegistro(r!, hash, d);
    d.almacen.corregir("agencia-1", "feed", "7", "ascensor", true);
    await procesarRegistro(r!, hash, { ...d, forzar: true });
    const g = [...d.almacen.guardados.values()][0]!.payload;
    expect(g.fields.find((f) => f.field_id === "ascensor")).toMatchObject({ value: true, method: "manual" });
  });

  it("sin los campos obligatorios queda en borrador y va a la cola de revisión", async () => {
    const [sinPrecio] = parsearFeedXml(XML.replace("<price>185000</price>", ""), { adaptador: "crm" });
    const d = deps();
    const res = await procesarRegistro(sinPrecio!, hashContenido(sinPrecio!), d);
    expect(res.estado).toBe("borrador");
    const g = [...d.almacen.guardados.values()][0]!.payload;
    expect(g.reviews.some((x) => x.field_id === "precio")).toBe(true);
  });

  it("slug sin habitaciones ni tipo", () => {
    expect(slugInmueble({ schemaVersion: 1, ref: "X", catalogVersion: "v", procesadoEn: "", modo: "normal", campos: {} }, "AB 12")).toBe("inmueble-ref-ab-12");
  });
});
