import { describe, expect, it } from "vitest";
import { CATALOG } from "@/catalog/index";
import { construirEvidencias } from "@/evidencia/index";
import { JevError } from "@/jev/errors";
import { FakeJev, type Script } from "@/jev/fake";
import type { RegistroFuente } from "@/ingesta/tipos";
import { CampoCanonico } from "./canonico";
import { enriquecer } from "./ejecutar";

function registro(campos: Record<string, string>, descripcion = "", extra: Partial<RegistroFuente> = {}): RegistroFuente {
  return { fuente: "feed", adaptador: "test", sourceId: "1", ref: "T-1", campos, titulo: {}, descripcion: descripcion ? { es: descripcion } : {}, imagenes: [], capturadoEn: "2026-09-24T10:00:00Z", ficticio: true, ...extra };
}

const BASE = { price: "185000", price_freq: "sale", type: "apartment", beds: "3", baths: "2", "surface_area/built": "90" };

async function correr(r: RegistroFuente, scripts: Script[] = [], opciones: Partial<Parameters<typeof enriquecer>[1]> = {}) {
  // Un guion por paquete: FakeJev aplica los guiones en orden de llamada, así que se fusionan todos
  // y cada pregunta toma su respuesta por id.
  const unido: Script = Object.assign({}, ...scripts);
  const jev = new FakeJev({ responder: (id) => unido[id] });
  const res = await enriquecer(
    { ref: r.ref, evidencias: construirEvidencias(r), descripcion: r.descripcion.es ?? "", capturadoEn: r.capturadoEn },
    { jev, catalog: CATALOG, reintentos: { intentos: 3, baseMs: 1, maxMs: 1, dormir: async () => {} }, limitadores: new Map(), ...opciones },
  );
  return { ...res, jev };
}

describe("cascada SDE", () => {
  it("todo estructurado y sin texto: etapa mini, sin llamadas a Jev en core", async () => {
    const { canonico, jev, paquetes } = await correr(registro(BASE));
    expect(canonico.campos.precio).toMatchObject({ value: "185000", status: "confirmado", method: "mini" });
    expect(canonico.campos.habitaciones).toMatchObject({ value: 3, status: "confirmado", method: "mini" });
    expect(canonico.campos.tipo).toMatchObject({ value: "piso", method: "mini" });
    expect(paquetes.find((p) => p.paquete === "core")!.llamada).toBe(false);
    // Sin descripción no se pregunta nada del paquete físico.
    expect(jev.calls).toHaveLength(0);
    expect(canonico.campos.terraza).toMatchObject({ value: null, status: "no_consta" });
  });

  it("precio en conflicto: adjudicación con candidatos y motivo, y evidencias perdedoras", async () => {
    const r = registro(BASE, "Precio rebajado: 175.000 € (antes 185.000 €). Piso luminoso.");
    const { canonico, jev, decisiones } = await correr(r, [{ precio__candidato: "c2", precio__motivo: "precio_rebajado" }]);
    const q = jev.calls.find((c) => c.purpose === "sde.core")!.questions;
    expect(Object.keys(q)).toEqual(expect.arrayContaining(["precio__candidato", "precio__motivo"]));
    expect(canonico.campos.precio).toMatchObject({ value: "175000", status: "confirmado", method: "reasoning" });
    expect(canonico.campos.precio!.adjudicacion).toMatchObject({ motivo: "precio_rebajado" });
    expect(canonico.campos.precio!.adjudicacion!.perdedoras.map((p) => p.valor)).toContain("185000");
    expect(decisiones.some((d) => d.gateKey === "campo:precio" && d.questionId === "precio__candidato")).toBe(true);
  });

  it("conflicto con poca confianza: fuente más fuerte, marcada, y a la cola de revisión", async () => {
    const r = registro(BASE, "Precio 175.000 €.");
    const { canonico, revisiones } = await correr(r, [{ precio__candidato: { dist: { c1: 0.5, c2: 0.45 } } }]);
    expect(canonico.campos.precio).toMatchObject({ value: "185000", status: "revisar" });
    expect(revisiones.find((x) => x.campo === "precio")).toMatchObject({ motivo: "conflicto" });
  });

  it("terraza solo en el texto: Jev lo confirma y se cita la mención", async () => {
    const { canonico } = await correr(registro(BASE, "Piso con terraza de 15 m² y vistas."), [{ terraza: 0.96 }]);
    expect(canonico.campos.terraza).toMatchObject({ value: true, status: "confirmado", method: "reasoning" });
    expect(canonico.campos.terraza!.evidenceIds).toHaveLength(1);
  });

  it("«no» de Jev sin evidencia negativa = no consta (nunca se inventa un «no tiene»)", async () => {
    const { canonico } = await correr(registro(BASE, "Piso reformado en el centro."), [{ ascensor: 0.03 }]);
    expect(canonico.campos.ascensor).toMatchObject({ value: null, status: "no_consta" });
  });

  it("«sin ascensor» explícito + Jev no → false confirmado", async () => {
    const { canonico } = await correr(registro(BASE, "Tercer piso sin ascensor."), [{ ascensor: 0.03 }]);
    expect(canonico.campos.ascensor).toMatchObject({ value: false, status: "confirmado" });
  });

  it("Jev dice sí sin mención extraída: cita la descripción completa como evidencia", async () => {
    const { canonico, evidenciasNuevas } = await correr(registro(BASE, "Zona chill-out en la azotea con barbacoa."), [{ terraza: 0.93 }]);
    expect(canonico.campos.terraza).toMatchObject({ value: true, status: "confirmado" });
    expect(evidenciasNuevas.map((e) => e.id)).toEqual(canonico.campos.terraza!.evidenceIds);
  });

  it("ordinal: solo si el anuncio lo describe", async () => {
    const r = registro(BASE, "Vivienda para reformar, ideal para darle tu toque.");
    const a = await correr(r, [{ estado__consta: 0.95, estado: { score: 0, confidence: 0.9 } }]);
    expect(a.canonico.campos.estado).toMatchObject({ value: "a_reformar", status: "confirmado" });
    const b = await correr(r, [{ luminosidad__consta: 0.1, luminosidad: { score: 3, confidence: 0.9 } }]);
    expect(b.canonico.campos.luminosidad).toMatchObject({ value: null, status: "no_consta" });
  });

  it("enum compatible con la fuente: piscina del feed acotada + texto «piscina comunitaria»", async () => {
    const { canonico } = await correr(registro({ ...BASE, pool: "1" }, "Urbanización con piscina comunitaria."), [{ piscina: "comunitaria" }]);
    expect(canonico.campos.piscina).toMatchObject({ value: "comunitaria", status: "confirmado", method: "verify" });
  });

  it("enum incompatible con la fuente estructurada: nunca se confirma solo", async () => {
    const { canonico, revisiones } = await correr(registro({ ...BASE, pool: "0" }, "Con piscina privada."), [{ piscina: "privada" }]);
    expect(canonico.campos.piscina!.status).toBe("probable");
    expect(revisiones.find((x) => x.campo === "piscina")).toMatchObject({ motivo: "conflicto" });
  });

  it("las correcciones manuales ganan y no se preguntan", async () => {
    const manual = { value: "180000", confidence: 1, status: "confirmado" as const, evidenceIds: [], method: "manual" as const, catalogVersion: CATALOG.version };
    const { canonico, jev } = await correr(registro(BASE, "Precio 175.000 €."), [], { manuales: { precio: manual } });
    expect(canonico.campos.precio).toEqual(manual);
    expect(jev.calls.flatMap((c) => Object.keys(c.questions))).not.toContain("precio__candidato");
  });

  it("modo sin Jev: no hay llamadas, lo dudoso queda en revisar y nada se inventa", async () => {
    const { canonico, jev, revisiones } = await correr(registro(BASE, "Precio 175.000 €. Con terraza."), [], { modo: "sin_jev" });
    expect(jev.calls).toHaveLength(0);
    expect(canonico.campos.precio).toMatchObject({ value: "185000", status: "revisar" });
    expect(canonico.campos.terraza).toMatchObject({ value: true, status: "revisar" });
    expect(canonico.campos.ascensor).toMatchObject({ value: null, status: "no_consta" });
    expect(revisiones.length).toBeGreaterThan(0);
  });

  it("el state de Jev no lleva emails ni teléfonos", async () => {
    const { jev } = await correr(registro(BASE, "Con terraza. Llame al 968 123 456 o escriba a ana@example.com"), [{ terraza: 0.9 }]);
    const enviado = JSON.stringify(jev.calls.map((c) => c.state));
    expect(enviado).not.toMatch(/968 123 456|ana@example\.com/);
    expect(enviado).toMatch(/\[teléfono\]/);
  });

  it("una petición por paquete, paquetes en paralelo, y el vacacional solo si aplica", async () => {
    const { jev, paquetes } = await correr(registro(BASE, "Con terraza, ascensor y certificado energético E. Sin cargas."));
    const porPaquete = jev.calls.map((c) => c.purpose);
    expect(new Set(porPaquete).size).toBe(porPaquete.length);
    expect(paquetes.find((p) => p.paquete === "vacacional")).toMatchObject({ llamada: false, preguntas: 0 });
  });

  it("reintenta errores recuperables de Jev", async () => {
    const jev = new FakeJev();
    let fallos = 0;
    const ask = jev.ask.bind(jev);
    jev.ask = async (req) => {
      if (fallos++ < 2) throw new JevError("rate_limited", "429");
      return ask(req);
    };
    const r = registro(BASE, "Con terraza.");
    const res = await enriquecer(
      { ref: r.ref, evidencias: construirEvidencias(r), descripcion: r.descripcion.es!, capturadoEn: r.capturadoEn },
      { jev, catalog: CATALOG, reintentos: { intentos: 3, baseMs: 1, maxMs: 1, dormir: async () => {} }, limitadores: new Map() },
    );
    expect(res.canonico.campos.terraza).toBeDefined();
  });

  it("gastos solo en el texto que Jev no confirma: regla on_low_confidence = no_consta", async () => {
    const { canonico } = await correr(registro(BASE, "Comunidad 50 €/mes."), [{ gastos_comunidad__verificar: 0.1 }]);
    expect(canonico.campos.gastos_comunidad).toMatchObject({ value: null, status: "no_consta" });
  });

  it("invariante: todos los campos válidos y todo valor con evidencia", async () => {
    const { canonico } = await correr(registro(BASE, "Ático con terraza, garaje incluido y trastero. Comunidad 50 €/mes. IBI 300 € al año."), [{ terraza: 0.97, garaje: "incluido", trastero: 0.95, gastos_comunidad__verificar: 0.95, ibi__verificar: 0.95 }]);
    for (const c of Object.values(canonico.campos)) expect(CampoCanonico.safeParse(c).success).toBe(true);
    expect(canonico.campos.gastos_comunidad).toMatchObject({ value: "50" });
    expect(canonico.campos.ibi).toMatchObject({ value: "300" });
    expect(Object.keys(canonico.campos).sort()).toEqual(CATALOG.fields.filter((f) => !CATALOG.packs.find((p) => p.id === "vacacional")!.fields.includes(f.id)).map((f) => f.id).sort());
  });
});
