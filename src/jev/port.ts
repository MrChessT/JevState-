import type { ChoiceResponse, EntryType, NoulResponse, Questions, ScoreResponse, Usage } from "@typesafe-ai/sdk";

export type JevAnswer = NoulResponse | ChoiceResponse | ScoreResponse;

/**
 * Para qué es la llamada. Sirve para métricas, auditoría y para comprobar el presupuesto de
 * llamadas por mensaje (máximo 2 en tiempo real: `asistente.entender` y `asistente.juzgar`).
 */
export type JevPurpose =
  | "asistente.entender"
  | "asistente.juzgar"
  | `sde.${string}`
  | "valoracion.comparables"
  | "eval"
  | "ping";

export interface JevRequest {
  purpose: JevPurpose;
  state: EntryType;
  questions: Questions;
  /** Versión del catálogo con la que se construyeron las preguntas (entra en la clave de caché). */
  catalogVersion: string;
  signal?: AbortSignal;
}

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: Usage;
  cached: boolean;
  latencyMs: number;
}

export interface JevHealth {
  ok: boolean;
  model: string | null;
  latencyMs: number | null;
  via: "typesafe" | "ai-gateway" | "fake";
}

/** Resultado de una llamada real de prueba (diagnóstico público de /api/salud?jev=1). */
export interface JevDiagnostico {
  ok: boolean;
  latencyMs: number | null;
  /** Código del fallo y primera línea del mensaje, sin credenciales. */
  error: { codigo: string; detalle: string } | null;
}

/** Puerto único hacia Jev. El resto del código nunca importa el SDK directamente. */
export interface JevPort {
  readonly model: string;
  ask(request: JevRequest): Promise<JevResult>;
  health(): Promise<JevHealth>;
  diagnostico(): Promise<JevDiagnostico>;
}
