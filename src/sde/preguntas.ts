// Preguntas del pipeline SDE (sección 1.1 y 3.3) construidas desde el catálogo compilado.
// Jev nunca produce cifras ni texto: en los campos numéricos el código extrae candidatos y Jev
// elige entre ellos (choice) o valida uno (noul).
import { choice, noul, score, type ChoiceCriteria, type Question } from "@typesafe-ai/sdk";
import type { CompiledField, CompiledRule } from "@/catalog/schema";

export const NO_CONSTA = "no_consta";
export const NINGUNO = "ninguno";

export interface Candidato {
  /** Clave de la opción: c1, c2… (estable dentro de la pregunta). */
  clave: string;
  /** Valor normalizado por el código, ya formateado para Jev («250000 EUR», «85 m2»). */
  valor: string;
  fuente: string;
  /** Fragmento literal donde se encontró. */
  fragmento: string;
}

/** Id de la pregunta dentro de un paquete: <campo> o <campo>__<sufijo>. */
export const idPregunta = (campo: string, sufijo?: string) => (sufijo ? `${campo}__${sufijo}` : campo);

function fill(template: string, candidate: string): string {
  return template.replaceAll("{candidate}", candidate);
}

/** boolean → noul con la pregunta del catálogo. */
export function preguntaBooleana(f: CompiledField): Question {
  if (f.type !== "boolean" || !f.question || !f.criteria) throw new Error(`${f.id} no es un booleano completo`);
  return noul(f.question, f.criteria);
}

/** enum → choice entre los valores + no_consta. */
export function preguntaEnum(f: CompiledField): Question {
  if (f.type !== "enum" || !f.question || !f.options) throw new Error(`${f.id} no es un enum completo`);
  return choice(f.question, { ...f.options, [NO_CONSTA]: "The listing does not say." });
}

/** ordinal → score con los niveles en el orden del catálogo. */
export function preguntaOrdinal(f: CompiledField): Question {
  if (f.type !== "ordinal" || !f.question || !f.options || !f.enumValues) throw new Error(`${f.id} no es un ordinal completo`);
  const levels = f.enumValues.map((v, i) => `${i}: ${f.options![v]}`);
  return score(f.question, levels as unknown as readonly [string, string, ...string[]]);
}

/** Verify: «¿es {candidate} el precio…?» sobre un único candidato estructurado. */
export function preguntaVerificar(f: CompiledField, candidato: string): Question {
  if (!f.question || !f.criteria) throw new Error(`${f.id} no tiene pregunta de verificación`);
  return noul(fill(f.question, candidato), f.criteria);
}

/** Varios candidatos numéricos: choice entre ellos + ninguno. */
export function preguntaCandidatos(f: CompiledField, candidatos: Candidato[]): Question {
  if (candidatos.length === 0) throw new Error(`${f.id}: sin candidatos`);
  const criteria: ChoiceCriteria = {};
  for (const c of candidatos) criteria[c.clave] = { value: c.valor, source: c.fuente, excerpt: c.fragmento };
  criteria[NINGUNO] = "None of these values is right.";
  return choice({ question: `Which value is right? ${fill(f.question ?? "", "the value")}`, field: f.label.en }, criteria);
}

/** Adjudicación: motivo del conflicto entre evidencias, con las opciones fijas de la regla. */
export function preguntaMotivo(f: CompiledField, r: CompiledRule): Question {
  return choice({ question: "The sources disagree about this value. What best explains the difference?", field: f.label.en }, r.reasons);
}

/** Nivel del score → valor del enumerado ordinal (tabla del catálogo). */
export function valorOrdinal(f: CompiledField, level: number): string {
  const values = f.enumValues ?? [];
  const index = Math.max(0, Math.min(values.length - 1, Math.round(level)));
  const value = values[index];
  if (value === undefined) throw new Error(`${f.id}: escala vacía`);
  return value;
}
