import { describe, expect, it } from "vitest";
import { choiceAnswer, choiceDist, noulAnswer, scoreAnswer } from "@/jev/fake";
import { gateChoice, gateNoul, gateScore, worst } from "./gate";
import { ACCION_DE_INTENCION, esRelevante, faltan, POLITICAS, umbral } from "./policy";
import { DEFAULT_THRESHOLDS as T, loadThresholds } from "./thresholds";

describe("umbrales", () => {
  it("valores iniciales de la especificación (4.3)", () => {
    expect(T.intencion_lectura).toMatchObject({ act: 0.6, ask: 0.45 });
    expect(T.intencion_escritura).toMatchObject({ act: 0.85, ask: 0.5 });
    expect(T.zona).toMatchObject({ act: 0.7, ask: 0.45, minMargin: 0.2 });
    expect(T.presupuesto_ok).toMatchObject({ act: 0.85, ask: 0.6 });
    expect(T.seguimiento.act).toBe(0.65);
    expect(T.borrador.act).toBe(0.9);
    expect(T.inyeccion.act).toBe(0.7);
  });

  it("se sobrescriben por entorno", () => {
    const t = loadThresholds({ GATE_ZONA_ACT: "0.8", GATE_ZONA_MARGIN: "0.1" });
    expect(t.zona).toMatchObject({ act: 0.8, ask: 0.45, minMargin: 0.1 });
  });

  it("rechaza valores fuera de rango o incoherentes", () => {
    expect(() => loadThresholds({ GATE_ZONA_ACT: "1.5" })).toThrow(/GATE_ZONA_ACT/);
    expect(() => loadThresholds({ GATE_ZONA_ACT: "0.3" })).toThrow(/incoherentes/);
  });
});

describe("puertas", () => {
  const zonas = ["murcia", "cartagena", "varias", "ninguna"];

  it("choice: actúa, confirma o pregunta según la confianza", () => {
    expect(gateChoice(choiceAnswer(zonas, "murcia", 0.97), T.zona).outcome).toBe("actuar");
    expect(gateChoice(choiceDist(zonas, { murcia: 0.62, cartagena: 0.3 }), T.zona).outcome).toBe("confirmar");
    expect(gateChoice(choiceDist(zonas, { murcia: 0.4, cartagena: 0.35 }), T.zona).outcome).toBe("preguntar");
  });

  it("choice: sin margen suficiente entre las dos primeras no actúa", () => {
    const answer = { ...choiceDist(zonas, { murcia: 0.55, cartagena: 0.45 }), confidence: 0.9 };
    const r = gateChoice(answer, T.zona);
    expect(r.margin).toBeCloseTo(0.1);
    expect(r.outcome).toBe("confirmar");
  });

  it("noul con «sí» bueno y con «sí» malo", () => {
    expect(gateNoul(noulAnswer(0.9), T.presupuesto_ok)).toBe("actuar");
    expect(gateNoul(noulAnswer(0.7), T.presupuesto_ok)).toBe("confirmar");
    expect(gateNoul(noulAnswer(0.2), T.presupuesto_ok)).toBe("preguntar");
    expect(gateNoul(noulAnswer(0.05), T.inyeccion)).toBe("actuar");
    expect(gateNoul(noulAnswer(0.71), T.inyeccion)).toBe("preguntar");
  });

  it("score redondea al nivel más cercano dentro de la escala", () => {
    const r = gateScore(scoreAnswer(5, 3.6, 0.8), T.encaje, 5);
    expect(r).toMatchObject({ level: 4, outcome: "actuar" });
    expect(gateScore(scoreAnswer(5, 9, 0.8), T.encaje, 5).level).toBe(4);
  });

  it("worst", () => {
    expect(worst("actuar", "confirmar")).toBe("confirmar");
    expect(worst("actuar", "preguntar", "confirmar")).toBe("preguntar");
    expect(worst()).toBe("actuar");
  });
});

describe("política por contexto", () => {
  it("buscar: basta zona, presupuesto o inmueble de referencia", () => {
    expect(faltan("buscar", new Set(["presupuesto"]))).toEqual([]);
    expect(faltan("buscar", new Set())).toEqual([["zona", "presupuesto", "inmueble_ref"]]);
  });

  it("lo irrelevante no se evalúa", () => {
    expect(esRelevante("buscar", "email")).toBe(false);
    expect(esRelevante("detalle_inmueble", "presupuesto")).toBe(false);
    expect(esRelevante("valorar_mi_vivienda", "planta")).toBe(true);
  });

  it("riesgo alto: act ≥ 0,95 y sin relajación por literal", () => {
    expect(umbral(T, "inmueble_ref", "pedir_visita").act).toBe(0.95);
    expect(umbral(T, "inmueble_ref", "pedir_visita", { literal: true }).act).toBe(0.95);
  });

  it("evidencia literal baja el umbral 0,15 en lectura", () => {
    const spec = umbral(T, "zona", "buscar", { literal: true });
    expect(spec).toMatchObject({ act: 0.55, ask: 0.3, minMargin: 0.1 });
  });

  it("la relajación no afecta a las alarmas (inyección)", () => {
    expect(umbral(T, "inyeccion", "buscar", { literal: true }).act).toBe(0.7);
  });

  it("todas las intenciones con acción usan una política existente", () => {
    for (const accion of Object.values(ACCION_DE_INTENCION)) if (accion) expect(POLITICAS[accion]).toBeDefined();
    expect(POLITICAS.pedir_visita.riesgo).toBe("alto");
    expect(POLITICAS.crear_alerta.umbralIntencion).toBe("intencion_escritura");
  });
});
