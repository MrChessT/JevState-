// Plan por campo (sección 3.3): qué se decide sin Jev (mini), qué se verifica (verify) y qué se
// razona sobre el texto (reasoning), y cómo se resuelve cada respuesta con la puerta del campo.
import Decimal from "decimal.js";
import type { Question, Questions } from "@typesafe-ai/sdk";
import { NUMERIC_TYPES, type CompiledField, type CompiledRule } from "@/catalog/schema";
import { ESTRUCTURADAS, type Evidencia } from "@/evidencia/tipos";
import { asChoice, asNoul, asScore, gateChoice, gateNoul, gateScore, type GateOutcome } from "@/gates/gate";
import type { GateSpec } from "@/gates/thresholds";
import type { JevAnswer } from "@/jev/port";
import { NINGUNO, NO_CONSTA, preguntaBooleana, preguntaCandidatos, preguntaConsta, preguntaEnum, preguntaMotivo, preguntaOrdinal, preguntaVerificar, valorOrdinal, type Candidato as OpcionCandidato } from "../preguntas";
import type { CampoCanonico, ItemRevision } from "./canonico";

export interface DecisionParcial {
  questionId: string;
  question: Question;
  answer: JevAnswer;
  gate: GateSpec;
  outcome: GateOutcome;
  chosen: string | number | boolean | null;
}

export interface ResultadoCampo {
  campo: CampoCanonico;
  revision?: ItemRevision;
  decisiones: DecisionParcial[];
  /** Evidencias creadas para citar el texto completo (Jev lo dedujo de la descripción). */
  evidenciasNuevas?: Evidencia[];
}

export type PlanCampo =
  | { tipo: "resuelto"; resultado: ResultadoCampo }
  | {
      tipo: "jev";
      etapa: "verify" | "reasoning";
      preguntas: Questions;
      resolver: (answers: Record<string, JevAnswer | undefined>) => ResultadoCampo;
      /** Resolución sin Jev (caído o modo sin_jev). */
      degradado: () => ResultadoCampo;
    };

export interface ContextoPlan {
  catalogVersion: string;
  /** Referencia corta de una evidencia en el state («E3»). */
  ref: (e: Evidencia) => string;
  /** Evidencia que cita la descripción completa para un campo (si hay descripción). */
  evidenciaDescripcion: (campo: string) => Evidencia | null;
  hayDescripcion: boolean;
}

// Utilidades --------------------------------------------------------------------------

const esNumerico = (f: CompiledField) => (NUMERIC_TYPES as readonly string[]).includes(f.type);
const peso = (e: Evidencia) => e.sourceWeight;
const masFuerte = (evs: Evidencia[]) => [...evs].sort((a, b) => peso(b) - peso(a))[0];
const estructuradas = (evs: Evidencia[]) => evs.filter((e) => ESTRUCTURADAS.has(e.source));
const deTexto = (evs: Evidencia[]) => evs.filter((e) => !ESTRUCTURADAS.has(e.source));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function spec(f: CompiledField, direction: GateSpec["direction"] = "confianza"): GateSpec {
  return { act: f.gate.act, ask: f.gate.ask, direction };
}

function campo(f: CompiledField, ctx: ContextoPlan, c: Omit<CampoCanonico, "catalogVersion">): CampoCanonico {
  return { ...c, confidence: r3(c.confidence), catalogVersion: ctx.catalogVersion };
}

function noConsta(f: CompiledField, ctx: ContextoPlan, nota: string, decisiones: DecisionParcial[] = []): ResultadoCampo {
  return { campo: campo(f, ctx, { value: null, confidence: 0, status: "no_consta", evidenceIds: [], method: decisiones.length ? "reasoning" : "mini", nota }), decisiones };
}

function revisar(f: CompiledField, ctx: ContextoPlan, valor: CampoCanonico["value"], evs: Evidencia[], confianza: number, metodo: CampoCanonico["method"], nota: string, motivo: ItemRevision["motivo"], decisiones: DecisionParcial[], adjudicacion?: CampoCanonico["adjudicacion"]): ResultadoCampo {
  const c = campo(f, ctx, { value: valor, confidence: confianza, status: valor === null ? "revisar" : "revisar", evidenceIds: evs.map((e) => e.id), method: metodo, nota, ...(adjudicacion ? { adjudicacion } : {}) });
  return { campo: c, decisiones, revision: { campo: f.id, motivo, propuesto: valor, confianza: r3(confianza), evidenceIds: c.evidenceIds, nota } };
}

/** Estado según la puerta: actuar → confirmado; confirmar → probable + revisión. */
function segunPuerta(f: CompiledField, ctx: ContextoPlan, outcome: GateOutcome, valor: CampoCanonico["value"], evs: Evidencia[], confianza: number, metodo: CampoCanonico["method"], decisiones: DecisionParcial[], extra: { adjudicacion?: CampoCanonico["adjudicacion"]; motivo?: ItemRevision["motivo"] } = {}): ResultadoCampo | null {
  if (outcome === "actuar") return { campo: campo(f, ctx, { value: valor, confidence: confianza, status: "confirmado", evidenceIds: evs.map((e) => e.id), method: metodo, ...(extra.adjudicacion ? { adjudicacion: extra.adjudicacion } : {}) }), decisiones };
  if (outcome === "confirmar") {
    const c = campo(f, ctx, { value: valor, confidence: confianza, status: "probable", evidenceIds: evs.map((e) => e.id), method: metodo, nota: "Confianza entre ask y act: pendiente de revisar", ...(extra.adjudicacion ? { adjudicacion: extra.adjudicacion } : {}) });
    return { campo: c, decisiones, revision: { campo: f.id, motivo: extra.motivo ?? "campo_dudoso", propuesto: valor, confianza: r3(confianza), evidenceIds: c.evidenceIds, nota: "Confianza entre ask y act" } };
  }
  return null;
}

// Rangos plausibles: un valor estructurado fuera de rango no se acepta sin verificar.
const RANGOS: Record<string, [number, number]> = {
  precio: [100, 30_000_000],
  superficie_construida: [8, 20_000],
  superficie_util: [8, 20_000],
  superficie_parcela: [20, 5_000_000],
  habitaciones: [0, 25],
  banos: [0, 15],
  planta: [-3, 45],
  gastos_comunidad: [0, 3_000],
  ibi: [0, 50_000],
  precio_anterior: [100, 30_000_000],
  rentabilidad_declarada: [0, 30],
};

function plausible(campoId: string, v: Decimal): boolean {
  const r = RANGOS[campoId];
  return !r || (v.gte(r[0]) && v.lte(r[1]));
}

// Numéricos ------------------------------------------------------------------------------

interface Grupo {
  valor: Decimal;
  evidencias: Evidencia[];
}

function dentroDeTolerancia(a: Decimal, b: Decimal, r: CompiledRule | undefined): boolean {
  if (!r) return a.eq(b);
  const tol = new Decimal(r.tolerance.value);
  if (r.tolerance.kind === "absolute") return a.minus(b).abs().lte(tol);
  return a.minus(b).abs().lte(Decimal.max(a, b).mul(tol).div(100));
}

export function agrupar(evs: Evidencia[], r: CompiledRule | undefined): Grupo[] {
  const grupos: Grupo[] = [];
  // Primero las fuentes fuertes: el valor representativo de un grupo es el de la más fuerte.
  for (const e of [...evs].sort((a, b) => peso(b) - peso(a))) {
    const valores = [String(e.parsed.valor), ...((e.parsed.alternativas as string[] | undefined) ?? [])];
    for (const raw of valores) {
      let v: Decimal;
      try {
        v = new Decimal(raw);
      } catch {
        continue;
      }
      const g = grupos.find((x) => dentroDeTolerancia(x.valor, v, r));
      if (g) {
        if (!g.evidencias.includes(e)) g.evidencias.push(e);
      } else grupos.push({ valor: v, evidencias: [e] });
    }
  }
  return grupos;
}

function valorNumerico(f: CompiledField, v: Decimal): string | number {
  return f.type === "integer" ? v.toNumber() : v.toString();
}

function mostrar(f: CompiledField, v: Decimal, e?: Evidencia): string {
  const unidad = f.unit ?? "";
  const periodo = e?.parsed.periodo && e.parsed.periodo !== "unico" ? ` per ${e.parsed.periodo === "mes" ? "month" : e.parsed.periodo === "año" ? "year" : e.parsed.periodo}` : "";
  return `${v.toString()}${unidad ? ` ${unidad.replace("/mes", "/month").replace("/año", "/year")}` : ""}${periodo}`;
}

/** Contexto que se espera en el texto para cada campo numérico (importes). */
const CONTEXTO_ESPERADO: Record<string, string> = { precio: "precio", precio_anterior: "precio_anterior", gastos_comunidad: "comunidad", ibi: "ibi" };

/**
 * ¿El texto aporta un matiz que obliga a verificar con Jev? Otro contexto («antes 250.000» para el
 * precio), una cifra ambigua («1,500») o una superficie sin tipo. Si el texto coincide sin matices,
 * no contradice a la fuente estructurada y basta la etapa mini (D-120).
 */
function textoConMatiz(f: CompiledField, evs: Evidencia[]): boolean {
  return deTexto(evs).some((e) => (e.parsed.contexto !== undefined && e.parsed.contexto !== CONTEXTO_ESPERADO[f.id]) || e.parsed.alternativas !== undefined || e.parsed.tipo === "desconocida");
}

function planNumerico(f: CompiledField, r: CompiledRule | undefined, evs: Evidencia[], ctx: ContextoPlan): PlanCampo {
  if (evs.length === 0) return { tipo: "resuelto", resultado: noConsta(f, ctx, "Sin evidencias") };
  const grupos = agrupar(evs, r);
  const conEstructura = grupos.filter((g) => estructuradas(g.evidencias).length > 0);
  const principal = conEstructura[0] ?? grupos[0]!;
  const fuerte = masFuerte(principal.evidencias)!;
  const onLow = r?.onLowConfidence ?? "revisar";

  // Mini: un único valor, estructurado, plausible y sin texto que lo matice.
  if (grupos.length === 1 && conEstructura.length === 1 && plausible(f.id, principal.valor) && deTexto(evs).length === 0) {
    return { tipo: "resuelto", resultado: { campo: campo(f, ctx, { value: valorNumerico(f, principal.valor), confidence: peso(fuerte), status: "confirmado", evidenceIds: principal.evidencias.map((e) => e.id), method: "mini" }), decisiones: [] } };
  }
  if (grupos.length === 1 && conEstructura.length === 1 && plausible(f.id, principal.valor) && !textoConMatiz(f, evs)) {
    // El texto dice lo mismo que la fuente estructurada, sin matices: tampoco hace falta Jev.
    return { tipo: "resuelto", resultado: { campo: campo(f, ctx, { value: valorNumerico(f, principal.valor), confidence: Math.min(1, peso(fuerte) + 0.03), status: "confirmado", evidenceIds: principal.evidencias.map((e) => e.id), method: "mini", nota: "Fuente estructurada y texto coinciden" }), decisiones: [] } };
  }

  const bajaConfianza = (decisiones: DecisionParcial[], confianza: number, metodo: CampoCanonico["method"], nota: string, motivo: ItemRevision["motivo"], adj?: CampoCanonico["adjudicacion"]): ResultadoCampo => {
    const valor = valorNumerico(f, principal.valor);
    if (onLow === "no_consta") return noConsta(f, ctx, `${nota} (on_low_confidence = no_consta)`, decisiones);
    if (onLow === "fuente_fuerte")
      return { campo: campo(f, ctx, { value: valor, confidence: confianza, status: "probable", evidenceIds: principal.evidencias.map((e) => e.id), method: metodo, nota: `${nota}: se muestra la fuente más fuerte`, ...(adj ? { adjudicacion: adj } : {}) }), decisiones };
    return revisar(f, ctx, valor, principal.evidencias, confianza, metodo, `${nota}: se muestra la fuente más fuerte, marcada`, motivo, decisiones, adj);
  };

  const degradado = (): ResultadoCampo => bajaConfianza([], peso(fuerte) * 0.5, "mini", "Sin Jev: no se pudo verificar", grupos.length > 1 ? "conflicto" : "campo_dudoso");

  if (grupos.length === 1) {
    // Verify: un solo candidato (estructurado con texto, o solo de texto).
    const q = preguntaVerificar(f, mostrar(f, principal.valor, fuerte));
    const id = `${f.id}__verificar`;
    const metodo = conEstructura.length ? "verify" : "reasoning";
    return {
      tipo: "jev",
      etapa: conEstructura.length ? "verify" : "reasoning",
      preguntas: { [id]: q },
      degradado,
      resolver: (answers) => {
        const a = asNoul(answers[id]);
        if (!a) return degradado();
        const g = spec(f, "si_bueno");
        const outcome = gateNoul(a, g);
        const decisiones: DecisionParcial[] = [{ questionId: id, question: q, answer: a, gate: g, outcome, chosen: outcome === "preguntar" ? null : String(principal.valor) }];
        return segunPuerta(f, ctx, outcome, valorNumerico(f, principal.valor), principal.evidencias, a.noul, metodo, decisiones) ?? bajaConfianza(decisiones, a.noul, metodo, "Jev no confirma el valor", "campo_dudoso");
      },
    };
  }

  // Adjudicación: varios valores en conflicto.
  const opciones: OpcionCandidato[] = grupos.map((g, i) => {
    const e = masFuerte(g.evidencias)!;
    return { clave: `c${i + 1}`, valor: mostrar(f, g.valor, e), fuente: `${e.source} (${ctx.ref(e)})`, fragmento: String(e.parsed.literal ?? e.raw).slice(0, 160) };
  });
  const qc = preguntaCandidatos(f, opciones);
  const qm = r ? preguntaMotivo(f, r) : null;
  const idc = `${f.id}__candidato`;
  const idm = `${f.id}__motivo`;
  return {
    tipo: "jev",
    etapa: "verify",
    preguntas: { [idc]: qc, ...(qm ? { [idm]: qm } : {}) },
    degradado,
    resolver: (answers) => {
      const a = asChoice(answers[idc]);
      if (!a) return degradado();
      const g = spec(f);
      const res = gateChoice(a, g);
      const decisiones: DecisionParcial[] = [{ questionId: idc, question: qc, answer: a, gate: g, outcome: res.outcome, chosen: res.choice }];
      const m = qm ? asChoice(answers[idm]) : undefined;
      if (m && qm) decisiones.push({ questionId: idm, question: qm, answer: m, gate: { act: 0.5, ask: 0.5, direction: "confianza" }, outcome: m.confidence >= 0.5 ? "actuar" : "preguntar", chosen: m.choice });
      const motivo = m && m.confidence >= 0.5 ? m.choice : "no_determinable";
      const idx = res.choice === NINGUNO ? -1 : Number(res.choice.slice(1)) - 1;
      const elegido = grupos[idx];
      const adj = (ganador: Grupo | undefined): CampoCanonico["adjudicacion"] => ({
        motivo,
        motivoConfianza: r3(m?.confidence ?? 0),
        perdedoras: grupos.filter((x) => x !== ganador).flatMap((x) => x.evidencias.map((e) => ({ evidenceId: e.id, valor: String(x.valor), source: e.source }))),
      });
      if (!elegido) return bajaConfianza(decisiones, res.confidence, "verify", "Jev: ninguno de los candidatos es correcto", "conflicto", adj(undefined));
      const metodo = estructuradas(elegido.evidencias).length ? "verify" : "reasoning";
      return (
        segunPuerta(f, ctx, res.outcome, valorNumerico(f, elegido.valor), elegido.evidencias, res.confidence, metodo, decisiones, { adjudicacion: adj(elegido), motivo: "conflicto" }) ??
        bajaConfianza(decisiones, res.confidence, "verify", "Conflicto sin resolver con confianza suficiente", "conflicto", adj(elegido))
      );
    },
  };
}

// Booleanos -----------------------------------------------------------------------------

function planBooleano(f: CompiledField, evs: Evidencia[], etapa: "verify" | "reasoning", ctx: ContextoPlan): PlanCampo {
  const si = evs.filter((e) => e.parsed.valor === true);
  const no = evs.filter((e) => e.parsed.valor === false);
  const est = estructuradas(evs);
  if (evs.length && est.length === evs.length && (si.length === 0 || no.length === 0)) {
    const v = si.length > 0;
    return { tipo: "resuelto", resultado: { campo: campo(f, ctx, { value: v, confidence: peso(masFuerte(evs)!), status: "confirmado", evidenceIds: evs.map((e) => e.id), method: "mini" }), decisiones: [] } };
  }
  if (evs.length === 0 && (etapa === "verify" || !ctx.hayDescripcion)) return { tipo: "resuelto", resultado: noConsta(f, ctx, "Sin evidencias") };

  const degradado = (): ResultadoCampo => {
    if (!evs.length) return noConsta(f, ctx, "Sin evidencias y sin Jev");
    const e = masFuerte(evs)!;
    return revisar(f, ctx, e.parsed.valor as boolean, [e], peso(e) * 0.5, "mini", "Sin Jev: evidencia sin verificar", si.length && no.length ? "conflicto" : "campo_dudoso", []);
  };
  const q = preguntaBooleana(f);
  return {
    tipo: "jev",
    etapa: est.length ? "verify" : "reasoning",
    preguntas: { [f.id]: q },
    degradado,
    resolver: (answers) => {
      const a = asNoul(answers[f.id]);
      if (!a) return degradado();
      const metodo = est.length ? "verify" : "reasoning";
      const gSi = spec(f, "si_bueno");
      const outSi = gateNoul(a, gSi);
      const citar = (lista: Evidencia[]) => {
        if (lista.length) return { evs: lista, nuevas: [] as Evidencia[] };
        const d = ctx.evidenciaDescripcion(f.id);
        return d ? { evs: [d], nuevas: [d] } : { evs: [], nuevas: [] };
      };
      const dec = (outcome: GateOutcome, chosen: boolean | null): DecisionParcial[] => [{ questionId: f.id, question: q, answer: a, gate: gSi, outcome, chosen }];
      if (outSi !== "preguntar") {
        const { evs: apoyo, nuevas } = citar(si);
        if (apoyo.length === 0) return noConsta(f, ctx, "Jev dice sí pero no hay texto que citar", dec("preguntar", null));
        const r = segunPuerta(f, ctx, outSi, true, apoyo, a.noul, metodo, dec(outSi, true))!;
        return { ...r, evidenciasNuevas: nuevas };
      }
      // «No» de Jev = «no tiene o no se menciona». Solo se guarda false con evidencia negativa explícita.
      const pNo = 1 - a.noul;
      const outNo = gateNoul({ type: "noul", noul: pNo }, gSi);
      if (no.length && outNo !== "preguntar") return segunPuerta(f, ctx, outNo, false, no, pNo, metodo, dec(outNo, false))!;
      if (si.length) return revisar(f, ctx, true, si, a.noul, metodo, "El texto lo menciona pero Jev no lo confirma", "campo_dudoso", dec("preguntar", null));
      if (no.length) return revisar(f, ctx, false, no, pNo, metodo, "Evidencia negativa sin confirmar", "campo_dudoso", dec("preguntar", null));
      return noConsta(f, ctx, "No se menciona", dec(outNo === "preguntar" ? "preguntar" : outNo, null));
    },
  };
}

// Enumerados ------------------------------------------------------------------------------

function planEnum(f: CompiledField, evs: Evidencia[], etapa: "verify" | "reasoning", ctx: ContextoPlan): PlanCampo {
  const valores = f.enumValues ?? [];
  const concretas = evs.filter((e) => typeof e.parsed.valor === "string" && valores.includes(e.parsed.valor as string));
  const acotan = evs.filter((e) => Array.isArray(e.parsed.valores));
  const est = estructuradas(concretas);
  const distintos = new Set(concretas.map((e) => e.parsed.valor));
  if (est.length && est.length === evs.length && distintos.size === 1) {
    return { tipo: "resuelto", resultado: { campo: campo(f, ctx, { value: [...distintos][0] as string, confidence: peso(masFuerte(est)!), status: "confirmado", evidenceIds: est.map((e) => e.id), method: "mini" }), decisiones: [] } };
  }
  if (evs.length === 0 && (etapa === "verify" || !ctx.hayDescripcion)) return { tipo: "resuelto", resultado: noConsta(f, ctx, "Sin evidencias") };
  // Valores compatibles con las fuentes estructuradas (si las hay).
  const permitidos = new Set<string>();
  for (const e of estructuradas(evs)) {
    if (typeof e.parsed.valor === "string") permitidos.add(e.parsed.valor);
    for (const v of (e.parsed.valores as string[] | undefined) ?? []) permitidos.add(v);
  }
  const degradado = (): ResultadoCampo => {
    const e = masFuerte(est.length ? est : concretas);
    if (!e) return noConsta(f, ctx, "Sin evidencia concreta y sin Jev");
    return revisar(f, ctx, e.parsed.valor as string, [e], peso(e) * 0.5, "mini", "Sin Jev: evidencia sin verificar", distintos.size > 1 ? "conflicto" : "campo_dudoso", []);
  };
  const q = preguntaEnum(f);
  return {
    tipo: "jev",
    etapa: est.length || acotan.length ? "verify" : "reasoning",
    preguntas: { [f.id]: q },
    degradado,
    resolver: (answers) => {
      const a = asChoice(answers[f.id]);
      if (!a) return degradado();
      const g = spec(f);
      let res = gateChoice(a, g);
      const metodo = est.length || acotan.length ? "verify" : "reasoning";
      if (res.choice === NO_CONSTA) {
        const decisiones: DecisionParcial[] = [{ questionId: f.id, question: q, answer: a, gate: g, outcome: res.outcome, chosen: null }];
        if (!concretas.length || res.outcome === "actuar") return concretas.length ? revisar(f, ctx, (masFuerte(concretas)!.parsed.valor as string), concretas, res.confidence, metodo, "Jev dice que no consta pero hay evidencia", "campo_dudoso", decisiones) : noConsta(f, ctx, "No consta", decisiones);
        return degradado();
      }
      // Incompatible con la fuente estructurada: nunca se confirma solo.
      if (permitidos.size && !permitidos.has(res.choice) && res.outcome === "actuar") res = { ...res, outcome: "confirmar" };
      const decisiones: DecisionParcial[] = [{ questionId: f.id, question: q, answer: a, gate: g, outcome: res.outcome, chosen: res.choice }];
      const apoyo = evs.filter((e) => e.parsed.valor === res.choice || ((e.parsed.valores as string[] | undefined) ?? []).includes(res.choice));
      const d = apoyo.length ? null : ctx.evidenciaDescripcion(f.id);
      const citadas = apoyo.length ? apoyo : d ? [d] : [];
      if (!citadas.length) return noConsta(f, ctx, "Sin texto que citar", decisiones);
      const r = segunPuerta(f, ctx, res.outcome, res.choice, citadas, res.confidence, metodo, decisiones, { motivo: permitidos.size && !permitidos.has(res.choice) ? "conflicto" : "campo_dudoso" });
      if (r) return { ...r, evidenciasNuevas: d ? [d] : [] };
      return concretas.length ? revisar(f, ctx, masFuerte(concretas)!.parsed.valor as string, concretas, res.confidence, metodo, "Jev duda: se muestra la evidencia más fuerte", "campo_dudoso", decisiones) : noConsta(f, ctx, "Jev no está seguro", decisiones);
    },
  };
}

// Ordinales ---------------------------------------------------------------------------------

function planOrdinal(f: CompiledField, evs: Evidencia[], ctx: ContextoPlan): PlanCampo {
  if (!ctx.hayDescripcion && evs.length === 0) return { tipo: "resuelto", resultado: noConsta(f, ctx, "Sin descripción") };
  const qs = preguntaOrdinal(f);
  const qc = preguntaConsta(f);
  const idc = `${f.id}__consta`;
  const levels = f.enumValues!.length;
  const degradado = (): ResultadoCampo => {
    const e = masFuerte(evs.filter((x) => typeof x.parsed.valor === "string"));
    return e ? revisar(f, ctx, e.parsed.valor as string, [e], peso(e) * 0.5, "mini", "Sin Jev: mención sin verificar", "campo_dudoso", []) : noConsta(f, ctx, "Sin Jev");
  };
  return {
    tipo: "jev",
    etapa: "reasoning",
    preguntas: { [f.id]: qs, [idc]: qc },
    degradado,
    resolver: (answers) => {
      const s = asScore(answers[f.id]);
      const c = asNoul(answers[idc]);
      if (!s || !c) return degradado();
      const gc: GateSpec = { act: 0.5, ask: 0.5, direction: "si_bueno" };
      const outC = gateNoul(c, gc);
      const decisiones: DecisionParcial[] = [{ questionId: idc, question: qc, answer: c, gate: gc, outcome: outC, chosen: c.noul >= 0.5 }];
      if (outC !== "actuar") return noConsta(f, ctx, "El anuncio no lo describe", decisiones);
      const g = spec(f);
      const res = gateScore(s, g, levels);
      const valor = valorOrdinal(f, res.level);
      decisiones.push({ questionId: f.id, question: qs, answer: s, gate: g, outcome: res.outcome, chosen: valor });
      const apoyo = evs.filter((e) => e.parsed.valor === valor);
      const d = apoyo.length ? null : ctx.evidenciaDescripcion(f.id);
      const citadas = apoyo.length ? apoyo : d ? [d] : [];
      if (!citadas.length) return noConsta(f, ctx, "Sin texto que citar", decisiones);
      const r = segunPuerta(f, ctx, res.outcome, valor, citadas, res.confidence, "reasoning", decisiones);
      if (r) return { ...r, evidenciasNuevas: d ? [d] : [] };
      return apoyo.length ? revisar(f, ctx, valor, apoyo, res.confidence, "reasoning", "Nivel dudoso", "campo_dudoso", decisiones) : noConsta(f, ctx, "Nivel dudoso sin mención explícita", decisiones);
    },
  };
}

// Texto -----------------------------------------------------------------------------------

function planTexto(f: CompiledField, evs: Evidencia[], ctx: ContextoPlan): PlanCampo {
  const e = masFuerte(evs.filter((x) => typeof x.parsed.valor === "string" && x.parsed.valor));
  if (!e) return { tipo: "resuelto", resultado: noConsta(f, ctx, "Sin evidencias") };
  // Los textos nunca se generan: literal de la fuente más fuerte.
  const conf = typeof e.parsed.confianza === "number" ? (e.parsed.confianza as number) : peso(e);
  const status = conf >= f.gate.act ? "confirmado" : conf >= f.gate.ask ? "probable" : "revisar";
  const c = campo(f, ctx, { value: e.parsed.valor as string, confidence: conf, status, evidenceIds: [e.id], method: "mini" });
  return { tipo: "resuelto", resultado: { campo: c, decisiones: [], ...(status !== "confirmado" ? { revision: { campo: f.id, motivo: "campo_dudoso", propuesto: c.value, confianza: c.confidence, evidenceIds: c.evidenceIds, nota: "Texto de fuente débil" } } : {}) } };
}

export function planificarCampo(f: CompiledField, r: CompiledRule | undefined, evs: Evidencia[], etapa: "verify" | "reasoning", ctx: ContextoPlan): PlanCampo {
  if (esNumerico(f)) return planNumerico(f, r, evs, ctx);
  if (f.type === "boolean") return planBooleano(f, evs, etapa, ctx);
  if (f.type === "enum") return planEnum(f, evs, etapa, ctx);
  if (f.type === "ordinal") return planOrdinal(f, evs, ctx);
  return planTexto(f, evs, ctx);
}
