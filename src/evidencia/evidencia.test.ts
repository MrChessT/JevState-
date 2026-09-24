import { describe, expect, it } from "vitest";
import { parsearCsvInmuebles } from "@/ingesta/csv";
import { hashContenido, leerFuente, FuenteSinBaseLegal, type AdaptadorFuente } from "@/ingesta/tipos";
import { parsearFeedXml } from "@/ingesta/xml-portales";
import { construirEvidencias } from "./index";
import { evidenciasDeHtml } from "./desde-html";
import { Evidencia } from "./tipos";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<root><kyero><feed_version>3</feed_version></kyero>
<property>
  <id>98</id><ref>REF-1234</ref><price>250000</price><currency>EUR</currency><price_freq>sale</price_freq>
  <type>Apartment</type><town>Cartagena</town><province>Murcia</province><postcode>30204</postcode>
  <location><latitude>37.6090</latitude><longitude>-0.9800</longitude></location>
  <beds>3</beds><baths>2</baths><pool>1</pool><floor>3</floor><community_fees>60</community_fees>
  <surface_area><built>95</built><plot>0</plot></surface_area>
  <energy_rating><consumption>E</consumption></energy_rating>
  <features><feature>Lift</feature><feature>Air conditioning</feature><feature>Communal pool</feature></features>
  <desc><es>Precio rebajado: 235.000 € (antes 250.000 €). Piso de 95 m² con terraza de 12 m² y sin trastero. Comunidad 60 €/mes.</es><en>Reduced price.</en></desc>
  <images><image id="1"><url>https://example.com/1.jpg</url></image></images>
</property>
</root>`;

describe("feed XML de portales", () => {
  const [r] = parsearFeedXml(XML, { adaptador: "crm", capturadoEn: "2026-09-24T10:00:00Z" });

  it("aplana campos, textos, coordenadas e imágenes", () => {
    expect(r).toMatchObject({ ref: "REF-1234", sourceId: "98", coordenadas: { lat: 37.609, lon: -0.98 }, imagenes: [{ url: "https://example.com/1.jpg" }] });
    expect(r!.campos).toMatchObject({ price: "250000", "surface_area/built": "95", "features/feature[0]": "Lift" });
    expect(r!.descripcion.es).toMatch(/^Precio rebajado/);
  });

  it("idempotencia: el hash no depende de la fecha de captura", () => {
    const [otra] = parsearFeedXml(XML, { adaptador: "crm", capturadoEn: "2030-01-01T00:00:00Z" });
    expect(hashContenido(otra!)).toBe(hashContenido(r!));
    const cambiada = XML.replace("<price>250000</price>", "<price>240000</price>");
    expect(hashContenido(parsearFeedXml(cambiada, { adaptador: "crm" })[0]!)).not.toBe(hashContenido(r!));
  });

  it("evidencias estructuradas y del texto, todas válidas", () => {
    const ev = construirEvidencias(r!);
    for (const e of ev) expect(Evidencia.safeParse(e).success).toBe(true);
    const de = (campo: string) => ev.filter((e) => e.campo === campo).map((e) => [e.source, e.parsed.valor ?? e.parsed.valores]);
    expect(de("precio")).toEqual([
      ["feed", "250000"],
      ["visible_text", "235000"],
      ["visible_text", "250000"],
    ]);
    expect(de("operacion")).toEqual([["feed", "venta"]]);
    expect(de("tipo")).toEqual([["feed", "piso"]]);
    expect(de("piscina")).toEqual([
      ["feed", ["privada", "comunitaria"]],
      ["feed", "comunitaria"],
    ]);
    expect(de("ascensor")).toEqual([["feed", true]]);
    expect(de("trastero")).toEqual([["visible_text", false]]);
    expect(de("terraza")).toEqual([["visible_text", true]]);
    expect(de("superficie_parcela")).toEqual([]); // plot 0 = no aplica
    expect(de("certificado_energetico")).toEqual([["feed", "e"]]);
  });

  it("el literal de texto lleva la frase con contexto y la posición exacta", () => {
    const e = construirEvidencias(r!).find((x) => x.campo === "precio" && x.source === "visible_text")!;
    expect(e.raw).toContain("Precio rebajado");
    expect(e.path).toMatch(/^desc\/es@\d+-\d+$/);
    expect(e.parsed.literal).toBe("235.000");
  });

  it("ids deterministas: reprocesar no duplica", () => {
    const a = construirEvidencias(r!).map((e) => e.id);
    const b = construirEvidencias(r!).map((e) => e.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("HTML: JSON-LD, meta, tabla y texto", () => {
  const html = `<html><head>
    <meta property="og:price:amount" content="250000">
    <meta name="description" content="Ático con terraza en Murcia">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateListing","offers":{"@type":"Offer","price":250000,"priceCurrency":"EUR"},"itemOffered":{"@type":"Apartment","floorSize":{"@type":"QuantitativeValue","value":90,"unitCode":"MTK"},"numberOfBedrooms":3}}</script>
    </head><body><nav>Inicio</nav>
    <h1>Ático en el Carmen</h1><p>Ahora por solo 235.000 €. Con ascensor.</p>
    <dl><dt>Superficie construida</dt><dd>92 m²</dd><dt>Habitaciones</dt><dd>3</dd><dt>Ascensor</dt><dd>Sí</dd></dl>
    </body></html>`;
  const ev = evidenciasDeHtml(html, "REF-9", "2026-09-24T10:00:00Z");
  const de = (campo: string) => ev.filter((e) => e.campo === campo).map((e) => [e.source, e.parsed.valor]);

  it("precios en conflicto quedan como evidencias separadas", () => {
    expect(de("precio")).toEqual([
      ["jsonld", "250000"],
      ["meta", "250000"],
      ["visible_text", "235000"],
    ]);
  });

  it("superficie: JSON-LD 90 y tabla 92", () => {
    expect(de("superficie_construida")).toEqual([
      ["jsonld", "90"],
      ["features_table", "92"],
    ]);
  });

  it("tabla y texto visible (sin navegación)", () => {
    expect(de("ascensor")).toEqual([
      ["features_table", true],
      ["visible_text", true],
    ]);
    expect(de("terraza")).toEqual([["meta", true]]);
  });
});

describe("CSV", () => {
  it("columnas del catálogo y textos por idioma", () => {
    const [r] = parsearCsvInmuebles("ref,operacion,tipo,precio,municipio,lat,lon,terraza,descripcion_es\nC-1,venta,piso,\"180.000\",Murcia,37.98,-1.13,si,Piso luminoso", { adaptador: "csv" });
    expect(r).toMatchObject({ ref: "C-1", coordenadas: { lat: 37.98, lon: -1.13 }, descripcion: { es: "Piso luminoso" } });
    const ev = construirEvidencias(r!);
    expect(ev.filter((e) => e.source === "csv").map((e) => [e.campo, e.parsed.valor])).toEqual([
      ["operacion", "venta"],
      ["tipo", "piso"],
      ["precio", "180000"],
      ["terraza", true],
    ]);
  });
});

describe("base legal de las fuentes", () => {
  it("una fuente sin base legal no se lee", async () => {
    const a: AdaptadorFuente = { codigo: "portal_x", legalOk: false, baseLegal: "", async *leer() {} };
    await expect(async () => {
      for await (const _ of leerFuente(a)) void _;
    }).rejects.toBeInstanceOf(FuenteSinBaseLegal);
  });

  it("los registros no válidos se informan sin parar la ingesta", async () => {
    const a: AdaptadorFuente = {
      codigo: "crm",
      legalOk: true,
      baseLegal: "Inmuebles propios",
      async *leer() {
        yield { fuente: "feed", adaptador: "crm", sourceId: "1", ref: "mal ref!", campos: {}, capturadoEn: "x" } as never;
        yield parsearFeedXml(XML, { adaptador: "crm" })[0]!;
      },
    };
    const res = [];
    for await (const x of leerFuente(a)) res.push(x.ok);
    expect(res).toEqual([false, true]);
  });
});
