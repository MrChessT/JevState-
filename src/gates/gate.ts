// Puertas: convierten una respuesta de Jev en actuar / confirmar / preguntar.
import type { ChoiceResponse, NoulResponse, ScoreResponse } from "@typesafe-ai/sdk";
import type { JevAnswer } from "@/jev/port";
import type { GateSpec } from "./thresholds";

export type GateOutcome = "actuar" | "confirmar" | "preguntar";

export interface RankedOption {
  option: string;
  probability: number;
}

export interface ChoiceGateResult {
  outcome: GateOutcome;
  choice: string;
  confidence: number;
  probability: number;
  margin: number;
  ranked: RankedOption[];
}

export function rank(probabilities: Record<string, number>): RankedOption[] {
  return Object.entries(probabilities)
    .map(([option, probability]) => ({ option, probability }))
    .sort((a, b) => b.probability - a.probability || a.option.localeCompare(b.option));
}

function byConfidence(value: number, spec: GateSpec): GateOutcome {
  return value >= spec.act ? "actuar" : value >= spec.ask ? "confirmar" : "preguntar";
}

export function gateChoice(answer: ChoiceResponse, spec: GateSpec): ChoiceGateResult {
  const ranked = rank(answer.probabilities as Record<string, number>);
  const probability = ranked[0]?.probability ?? 0;
  const margin = probability - (ranked[1]?.probability ?? 0);
  let outcome = byConfidence(answer.confidence, spec);
  // Con dos opciones casi empatadas no se actúa aunque la confianza global sea alta.
  if (outcome === "actuar" && spec.minMargin !== undefined && margin < spec.minMargin) outcome = "confirmar";
  return { outcome, choice: answer.choice, confidence: answer.confidence, probability, margin, ranked };
}

export function gateNoul(answer: NoulResponse, spec: GateSpec): GateOutcome {
  const p = answer.noul;
  if (spec.direction === "si_malo") return p <= spec.act ? "actuar" : p <= spec.ask ? "confirmar" : "preguntar";
  return byConfidence(p, spec);
}

export interface ScoreGateResult {
  outcome: GateOutcome;
  /** Nivel esperado (puede ser decimal). */
  score: number;
  /** Nivel entero más cercano, dentro de la escala. */
  level: number;
  confidence: number;
}

export function gateScore(answer: ScoreResponse, spec: GateSpec, levels: number): ScoreGateResult {
  const level = Math.max(0, Math.min(levels - 1, Math.round(answer.score)));
  return { outcome: byConfidence(answer.confidence, spec), score: answer.score, level, confidence: answer.confidence };
}

/** Peor de varios resultados: preguntar > confirmar > actuar. */
export function worst(...outcomes: GateOutcome[]): GateOutcome {
  if (outcomes.includes("preguntar")) return "preguntar";
  if (outcomes.includes("confirmar")) return "confirmar";
  return "actuar";
}

export function asChoice(answer: JevAnswer | undefined): ChoiceResponse | undefined {
  return answer?.type === "choice" ? answer : undefined;
}

export function asNoul(answer: JevAnswer | undefined): NoulResponse | undefined {
  return answer?.type === "noul" ? answer : undefined;
}

export function asScore(answer: JevAnswer | undefined): ScoreResponse | undefined {
  return answer?.type === "score" ? answer : undefined;
}
