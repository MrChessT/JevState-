import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { CatalogError, checkEnglish, checkKey, compileCatalog, versionFor, type SheetRows } from "./schema";
import { readCsvSources } from "../../scripts/catalog-sources";

const F_HEADER = "id,type,enum_values,unit,pack,question_en,true_en,false_en,options_en,extractor,gate_act,gate_ask,public,filterable,required_for_publish,label_es,label_en";

function sheets(fields: string[], packs = ["core,terraza,4,reasoning,"], rules: string[] = []): SheetRows {
  return {
    Fields: parseCsv([F_HEADER, ...fields].join("\n")),
    Parallel_Packs: parseCsv(["pack,fields,max_concurrency,stage,condition", ...packs].join("\n")),
    Adjudication_Rules: parseCsv(["field,source_priority,tolerance,reason_options,on_low_confidence", ...rules].join("\n")),
  };
}

const TERRAZA = "terraza,boolean,,,core,Does the property have a terrace?,Yes: it has one.,No: it does not.,,regex,0.85,0.6,si,si,no,Terraza,Terrace";

function errorsOf(fn: () => unknown): string[] {
  try {
    fn();
    return [];
  } catch (err) {
    if (err instanceof CatalogError) return err.errors;
    throw err;
  }
}

describe("CSV", () => {
  it("respeta comillas, comas y comillas escapadas", () => {
    const rows = parseCsv('a,"b, c","d ""e"""\n1,2,3\n');
    expect(rows).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("detecta comillas sin cerrar", () => {
    expect(() => parseCsv('a,"b')).toThrow(/comillas/);
  });
});

describe("reglas de idioma", () => {
  it("claves en español y snake_case", () => {
    expect(checkKey("no_consta", "x")).toEqual([]);
    expect(checkKey("NoConsta", "x")).toHaveLength(1);
    expect(checkKey("none", "x")[0]).toMatch(/inglés/);
    expect(checkKey("baño", "x")).toHaveLength(1);
  });

  it("texto en inglés", () => {
    expect(checkEnglish("Does the property have a terrace?", "x")).toEqual([]);
    expect(checkEnglish("¿Tiene terraza el piso?", "x")).toHaveLength(1);
    expect(checkEnglish("Does it have una terraza?", "x")).toHaveLength(1);
    // Los literales entre comillas y las siglas legales se permiten.
    expect(checkEnglish('Is it sold as "nuda propiedad" or VPO (IBI)?', "x")).toEqual([]);
  });
});

describe("compileCatalog", () => {
  it("compila el catálogo por defecto del repositorio", () => {
    const body = compileCatalog(readCsvSources());
    expect(body.fields.length).toBeGreaterThan(30);
    expect(body.packs.map((p) => p.id)).toEqual(["core", "financiero", "fisico", "legal", "vacacional"]);
    expect(body.packs.find((p) => p.id === "vacacional")?.condition).toEqual({ field: "operacion", op: "=", values: ["alquiler_vacacional"] });
    expect(body.adjudication.find((r) => r.field === "precio")?.tolerance).toEqual({ kind: "relative", value: "1" });
  });

  it("un catálogo mínimo válido", () => {
    const body = compileCatalog(sheets([TERRAZA]));
    expect(body.fields[0]).toMatchObject({ id: "terraza", type: "boolean", public: true, criteria: { true: "Yes: it has one." } });
  });

  it("ids repetidos, tipos desconocidos y preguntas en español", () => {
    const errors = errorsOf(() =>
      compileCatalog(
        sheets(
          [TERRAZA, TERRAZA.replace("Does the property have a terrace?", "¿Tiene terraza?"), "piscina,booleano,,,core,Pool?,a,b,,regex,0.8,0.5,si,si,no,Piscina,Pool"],
          ["core,terraza,4,reasoning,"],
        ),
      ),
    );
    expect(errors.join("\n")).toMatch(/id repetido/);
    expect(errors.join("\n")).toMatch(/debe estar en inglés/);
    expect(errors.join("\n")).toMatch(/tipo «booleano» no válido/);
  });

  it("referencias entre pestañas", () => {
    const errors = errorsOf(() => compileCatalog(sheets([TERRAZA], ["core,terraza|balcon,4,reasoning,", "otro,terraza,4,verify,"])));
    const text = errors.join("\n");
    expect(text).toMatch(/«balcon» no existe/);
    expect(text).toMatch(/ya está en el paquete/);
  });

  it("enum: options_en debe describir enum_values en orden y sin claves reservadas", () => {
    const bad = 'garaje,enum,incluido|no_consta,,core,Parking?,,,"no_consta: x. | incluido: y.",regex,0.8,0.5,si,si,no,Garaje,Parking';
    const text = errorsOf(() => compileCatalog(sheets([TERRAZA, bad], ["core,terraza|garaje,4,reasoning,"]))).join("\n");
    expect(text).toMatch(/reservada/);
    expect(text).toMatch(/mismo orden/);
  });

  it("numéricos: {candidate}, unidad y adjudicación solo en numéricos", () => {
    const precio = "precio,currency,,,core,Is it the price?,Yes.,No.,,regex,0.9,0.6,si,si,si,Precio,Price";
    const text = errorsOf(() =>
      compileCatalog(sheets([TERRAZA, precio], ["core,terraza|precio,4,verify,"], ['terraza,feed>jsonld,1%,"no_determinable: Cannot tell.",revisar'])),
    ).join("\n");
    expect(text).toMatch(/\{candidate\}/);
    expect(text).toMatch(/falta la unidad/);
    expect(text).toMatch(/solo aplica a campos numéricos/);
  });

  it("obligatorio salvo ciertos tipos, con valores validados", () => {
    const op = 'tipo,enum,piso|terreno,,core,Which type?,,,"piso: Flat. | terreno: Land.",feed,0.8,0.5,si,si,si,Tipo,Type';
    const hab = "habitaciones,integer,,,core,Is {candidate} the number of bedrooms?,Yes.,No.,,feed,0.85,0.6,si,si,si salvo tipo in (terreno),Habitaciones,Bedrooms";
    const body = compileCatalog(sheets([TERRAZA, op, hab], ["core,terraza|tipo|habitaciones,4,verify,"]));
    expect(body.fields.find((f) => f.id === "habitaciones")).toMatchObject({ requiredForPublish: true, requiredExcept: { field: "tipo", values: ["terreno"] } });
    const mala = hab.replace("(terreno)", "(castillo)");
    expect(errorsOf(() => compileCatalog(sheets([TERRAZA, op, mala], ["core,terraza|tipo|habitaciones,4,verify,"]))).join("\n")).toMatch(/«castillo» no es un valor de tipo/);
  });

  it("condiciones de paquete sobre valores existentes", () => {
    const op = 'operacion,enum,venta|alquiler,,core,Sale or rent?,,,"venta: Sale. | alquiler: Rent.",feed,0.8,0.5,si,si,si,Operación,Operation';
    const text = errorsOf(() => compileCatalog(sheets([TERRAZA, op], ["core,terraza|operacion,4,verify,operacion = subasta"]))).join("\n");
    expect(text).toMatch(/«subasta» no es un valor de operacion/);
  });

  it("columnas incorrectas", () => {
    const s = sheets([TERRAZA]);
    s.Parallel_Packs = parseCsv("pack,fields,stage\ncore,terraza,verify");
    expect(() => compileCatalog(s)).toThrow(/Faltan: max_concurrency, condition/);
  });
});

describe("versionFor", () => {
  const body = { fields: [], packs: [], adjudication: [] };
  it("conserva la versión si el contenido no cambia y la sube si cambia", () => {
    const v1 = versionFor(body, null, new Date("2026-09-24T10:00:00Z"));
    expect(v1.version).toMatch(/^2026-09-24\.[0-9a-f]{8}$/);
    expect(versionFor(body, v1, new Date("2027-01-01"))).toEqual(v1);
    expect(versionFor({ ...body, packs: [{ id: "x", fields: ["a"], maxConcurrency: 1, stage: "verify" }] }, v1).version).not.toBe(v1.version);
  });
});
