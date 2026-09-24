// Suites de evaluación. Las «sin Jev» corren en cada PR (npm run eval y catalog:compile).
// Fase 0: el contrato del catálogo. Las baterías de extracción (precios, m², habitaciones, zonas
// con erratas, planta, proximidad) se añaden con los normalizadores en la fase 1.
import type { EntryType, Question } from "@typesafe-ai/sdk";
import { checkEnglish, checkKey, NUMERIC_TYPES } from "../src/catalog/schema";
import { PREGUNTAS } from "../src/asistente/catalogo";
import { FakeJev } from "../src/jev/fake";
import { preguntaBooleana, preguntaCandidatos, preguntaEnum, preguntaMotivo, preguntaOrdinal, preguntaVerificar, valorOrdinal } from "../src/sde/preguntas";
import type { CaseResult, Suite } from "./framework";

/** Cadenas que ve Jev en una pregunta (instrucciones y criterios), sin las claves de las opciones. */
function textsOf(value: EntryType | undefined, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) textsOf(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) textsOf(v as EntryType, out);
  return out;
}

function checkQuestion(id: string, q: Question, samples: string[] = []): string[] {
  const errors: string[] = [];
  const strip = (t: string) => samples.reduce((acc, s) => acc.replaceAll(s, ""), t);
  for (const t of textsOf(q.instructions)) errors.push(...checkEnglish(strip(t), `${id}.instructions`));
  if (q.type === "choice") {
    const keys = Object.keys(q.criteria);
    if (keys.length < 2) errors.push(`${id}: una choice necesita al menos 2 opciones`);
    for (const k of keys) if (!/^c\d+$/.test(k)) errors.push(...checkKey(k, id));
    for (const t of textsOf(q.criteria as EntryType)) errors.push(...checkEnglish(strip(t), `${id}.criteria`));
  } else if (q.type === "noul") {
    for (const t of textsOf((q.criteria ?? null) as EntryType)) errors.push(...checkEnglish(strip(t), `${id}.criteria`));
  } else {
    if (q.criteria.length < 2) errors.push(`${id}: un score necesita al menos 2 niveles`);
    for (const t of textsOf(q.criteria as unknown as EntryType)) errors.push(...checkEnglish(strip(t), `${id}.criteria`));
  }
  return errors;
}

async function roundTrip(id: string, q: Question): Promise<string[]> {
  const jev = new FakeJev();
  const res = await jev.ask({ purpose: "eval", state: { probe: true }, questions: { [id]: q }, catalogVersion: "eval" });
  const a = res.answers[id];
  return a?.type === q.type ? [] : [`${id}: FakeJev devolvió ${a?.type ?? "nada"} para una pregunta ${q.type}`];
}

export const contratoCatalogo: Suite = {
  id: "contrato-catalogo",
  description: "Cada campo y cada pregunta del asistente produce preguntas válidas: inglés, claves en español, tipos correctos.",
  async run({ catalog }) {
    const cases: CaseResult[] = [];
    const push = (id: string, errors: string[]) => cases.push({ id, ok: errors.length === 0, detail: errors.join("; ") || undefined });

    for (const f of catalog.fields) {
      const errors: string[] = [];
      const questions: Array<[string, Question]> = [];
      try {
        if (f.type === "boolean") questions.push([f.id, preguntaBooleana(f)]);
        else if (f.type === "enum") questions.push([f.id, preguntaEnum(f)]);
        else if (f.type === "ordinal") {
          questions.push([f.id, preguntaOrdinal(f)]);
          f.enumValues!.forEach((v, i) => {
            if (valorOrdinal(f, i) !== v) errors.push(`${f.id}: el nivel ${i} no corresponde a «${v}»`);
          });
        } else if ((NUMERIC_TYPES as readonly string[]).includes(f.type)) {
          questions.push([`${f.id}__verificar`, preguntaVerificar(f, "123")]);
          questions.push([
            `${f.id}__candidato`,
            preguntaCandidatos(f, [
              { clave: "c1", valor: "123", fuente: "jsonld", fragmento: "123" },
              { clave: "c2", valor: "124", fuente: "visible_text", fragmento: "124" },
            ]),
          ]);
        }
      } catch (err) {
        errors.push(String(err));
      }
      for (const [id, q] of questions) errors.push(...checkQuestion(id, q, ["123", "124"]), ...(await roundTrip(id, q)));
      push(`campo:${f.id}`, errors);
    }

    for (const r of catalog.adjudication) {
      const f = catalog.fields.find((x) => x.id === r.field)!;
      const q = preguntaMotivo(f, r);
      push(`adjudicacion:${r.field}`, [...checkQuestion(`${r.field}__motivo`, q), ...(await roundTrip(`${r.field}__motivo`, q))]);
    }

    const sample = { clave: "murcia", descripcion: "Murcia (municipality)" };
    const inmueble = { clave: "ref_1234", descripcion: "Result 1: 3-bedroom flat, 185000 EUR" };
    const built: Array<[string, Question]> = [
      ["intencion", PREGUNTAS.intencion().pregunta],
      ["operacion", PREGUNTAS.operacion().pregunta],
      ["zona_1", PREGUNTAS.zona("murcia", [sample, { clave: "cartagena", descripcion: "Cartagena (municipality)" }]).pregunta],
      ["tipo", PREGUNTAS.tipo().pregunta],
      ["presupuesto_ok_1", PREGUNTAS.presupuesto_ok("250000 EUR", "250k").pregunta],
      ["presupuesto_tipo", PREGUNTAS.presupuesto_tipo("250000 EUR").pregunta],
      ["requisito_1", PREGUNTAS.requisito("terrace").pregunta],
      ["proximidad_1", PREGUNTAS.proximidad("beach").pregunta],
      ["prioridad", PREGUNTAS.prioridad().pregunta],
      ["perfil_declarado", PREGUNTAS.perfil_declarado().pregunta],
      ["inmueble_ref", PREGUNTAS.inmueble_ref([inmueble]).pregunta],
      ["campo_pregunta", PREGUNTAS.campo_pregunta(catalog.fields.filter((f) => f.public).map((f) => ({ clave: f.id, descripcion: f.label.en }))).pregunta],
      ["feedback_motivo", PREGUNTAS.feedback_motivo().pregunta],
      ["seguimiento", PREGUNTAS.seguimiento().pregunta],
      ["borrador", PREGUNTAS.borrador().pregunta],
      ["ambiguo", PREGUNTAS.ambiguo().pregunta],
      ["inyeccion", PREGUNTAS.inyeccion().pregunta],
      ["encaje_1", PREGUNTAS.encaje("ref_1234").pregunta],
      ["deseable_1", PREGUNTAS.deseable("ref_1234", "terrace").pregunta],
      ["comparable_1", PREGUNTAS.comparable("cmp_1").pregunta],
      ["ajuste_estado", PREGUNTAS.ajuste_estado().pregunta],
    ];
    for (const [id, q] of built) push(`asistente:${id}`, [...checkQuestion(id, q, ["250000 EUR", "250k", "ref_1234", "cmp_1"]), ...(await roundTrip(id, q))]);
    return cases;
  },
};

export const SUITES_SIN_JEV: Suite[] = [contratoCatalogo];
export const SUITES_CON_JEV: Suite[] = [];
