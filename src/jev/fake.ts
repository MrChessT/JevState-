// Jev simulado y determinista, para tests, evaluación sin Jev y desarrollo sin clave.
//
// Para cada pregunta, en este orden:
//   1. el guion de esa llamada (`scripts[n][id]`), si lo hay;
//   2. el `responder` (reglas del test o del modo desarrollo), si devuelve algo;
//   3. un valor por defecto prudente: en choice, la opción «vacía» (no_indicado, ninguno…) con 0,95;
//      en noul, 0,05; en score, el nivel 0 con confianza 0,5.
// Así, sin guion, el sistema se comporta como si Jev «no hubiera entendido nada», que es justo el
// caso degradado que hay que cubrir.
import type { ChoiceResponse, EntryType, NoulResponse, Question, Questions, ScoreResponse } from "@typesafe-ai/sdk";
import { JevError } from "./errors";
import type { JevAnswer, JevHealth, JevPort, JevRequest, JevResult } from "./port";

/** Confianza que devuelve el SDK para una distribución: lo seguro que está frente al azar. */
export function confidenceOf(probabilities: number[]): number {
  const n = probabilities.length;
  if (n <= 1) return 1;
  const top = Math.max(...probabilities);
  return Math.max(0, Math.min(1, (n * top - 1) / (n - 1)));
}

export function choiceAnswer(options: string[], winner: string, p = 0.95): ChoiceResponse {
  if (!options.includes(winner)) throw new Error(`La opción «${winner}» no existe: ${options.join(", ")}`);
  const n = options.length;
  const rest = n > 1 ? (1 - p) / (n - 1) : 0;
  const probabilities = Object.fromEntries(options.map((o) => [o, o === winner ? (n > 1 ? p : 1) : rest]));
  return { type: "choice", choice: winner, probabilities, confidence: confidenceOf(Object.values(probabilities)) };
}

/** Distribución explícita; lo que falte se reparte a partes iguales entre el resto de opciones. */
export function choiceDist(options: string[], dist: Record<string, number>): ChoiceResponse {
  for (const key of Object.keys(dist)) if (!options.includes(key)) throw new Error(`La opción «${key}» no existe: ${options.join(", ")}`);
  const assigned = Object.values(dist).reduce((a, b) => a + b, 0);
  const others = options.filter((o) => !(o in dist));
  const rest = others.length > 0 ? Math.max(0, 1 - assigned) / others.length : 0;
  const probabilities = Object.fromEntries(options.map((o) => [o, dist[o] ?? rest]));
  const [winner] = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]!;
  return { type: "choice", choice: winner, probabilities, confidence: confidenceOf(Object.values(probabilities)) };
}

export function noulAnswer(value: number): NoulResponse {
  return { type: "noul", noul: value };
}

/** Score con todo el peso en un nivel (o repartido entre dos si `value` no es entero). */
export function scoreAnswer(levels: number, value: number, confidence = 0.9): ScoreResponse {
  const lower = Math.max(0, Math.min(levels - 1, Math.floor(value)));
  const upper = Math.min(levels - 1, lower + 1);
  const frac = value - lower;
  const probabilities: Record<string, number> = {};
  const legend: Record<string, EntryType> = {};
  for (let i = 0; i < levels; i++) {
    probabilities[String(i)] = i === lower ? 1 - frac : i === upper && frac > 0 ? frac : 0;
    legend[String(i)] = `level ${i}`;
  }
  return { type: "score", score: value, confidence, probabilities, legend } as ScoreResponse;
}

export type ScriptValue = string | number | { dist: Record<string, number> } | { winner: string; p: number } | { score: number; confidence?: number };
export type Script = Record<string, ScriptValue>;
export type Responder = (id: string, question: Question, state: EntryType) => ScriptValue | undefined;

const EMPTY_CHOICES = ["no_indicado", "no_declarado", "ninguno", "ninguna", "no_aplica", "no_consta", "no_determinable", "otro"];

function answerFrom(id: string, q: Question, value: ScriptValue | undefined): JevAnswer {
  if (q.type === "choice") {
    const options = Object.keys(q.criteria);
    if (value && typeof value === "object" && "dist" in value) return choiceDist(options, value.dist);
    if (value && typeof value === "object" && "winner" in value) return choiceAnswer(options, value.winner, value.p);
    if (typeof value === "string") return choiceAnswer(options, value);
    if (value !== undefined) throw new Error(`Guion no válido para la pregunta choice «${id}»`);
    return choiceAnswer(options, options.find((o) => EMPTY_CHOICES.includes(o)) ?? options[0]!);
  }
  if (q.type === "noul") {
    if (typeof value === "number") return noulAnswer(value);
    if (value !== undefined) throw new Error(`Guion no válido para la pregunta noul «${id}»`);
    return noulAnswer(0.05);
  }
  const levels = q.criteria.length;
  if (typeof value === "number") return scoreAnswer(levels, value);
  if (value && typeof value === "object" && "score" in value) return scoreAnswer(levels, value.score, value.confidence);
  if (value !== undefined) throw new Error(`Guion no válido para la pregunta score «${id}»`);
  return scoreAnswer(levels, 0, 0.5);
}

export interface FakeJevOptions {
  scripts?: Script[];
  responder?: Responder;
  /** Latencia simulada en ms (para probar streaming y timeouts). */
  latencyMs?: number;
}

export class FakeJev implements JevPort {
  readonly model = "jev-fake";
  readonly calls: JevRequest[] = [];
  /** Si se define, la siguiente llamada falla con este error (y se limpia). */
  failNext: JevError | null = null;
  /** Si se define, todas las llamadas fallan con este error. */
  failAlways: JevError | null = null;

  constructor(private readonly options: FakeJevOptions = {}) {}

  async ask(request: JevRequest): Promise<JevResult> {
    if (request.signal?.aborted) throw new JevError("aborted", "Petición a Jev cancelada");
    const failure = this.failAlways ?? this.failNext;
    this.failNext = null;
    if (failure) throw failure;
    if (Object.keys(request.questions).length === 0) throw new JevError("invalid_request", "Jev rechazó la petición: no hay preguntas");
    const script = this.options.scripts?.[this.calls.length] ?? {};
    this.calls.push(request);
    if (this.options.latencyMs) await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    const answers: Record<string, JevAnswer> = {};
    for (const [id, q] of Object.entries(request.questions)) {
      const value = script[id] ?? this.options.responder?.(id, q, request.state);
      answers[id] = answerFrom(id, q, value);
    }
    const inputTokens = Math.ceil(JSON.stringify({ s: request.state, q: request.questions }).length / 4);
    return { model: this.model, answers, usage: { input_tokens: inputTokens, output_tokens: Object.keys(answers).length }, cached: false, latencyMs: this.options.latencyMs ?? 0 };
  }

  async health(): Promise<JevHealth> {
    return { ok: true, model: this.model, latencyMs: 0, via: "fake" };
  }

  /** Preguntas enviadas en la llamada n (para aserciones en tests). */
  questionsOf(n: number): Questions {
    return this.calls[n]?.questions ?? {};
  }
}
