// Auditoría de decisiones de Jev (principio 5): cada respuesta que pasa por una puerta se guarda
// con la pregunta, las opciones, las probabilidades, la versión del catálogo y el resultado.
import type { Question } from "@typesafe-ai/sdk";
import type { GateOutcome } from "@/gates/gate";
import type { JevAnswer, JevPurpose } from "./port";

export interface JevDecision {
  purpose: JevPurpose;
  questionId: string;
  questionType: Question["type"];
  /** Instrucciones tal como se enviaron (texto o JSON). */
  instructions: unknown;
  /** Opciones con su descripción (choice), criterios sí/no (noul) o niveles (score). */
  options: unknown;
  answer: JevAnswer;
  /** Valor elegido tras la puerta (clave de la opción, nivel o booleano), o null si se preguntó. */
  chosen: string | number | boolean | null;
  gateKey: string;
  gate: { act: number; ask: number; minMargin?: number };
  outcome: GateOutcome;
  catalogVersion: string;
  model: string;
  cached: boolean;
  /** Referencias opcionales; nunca datos personales. */
  conversationId?: string;
  messageId?: string;
  listingId?: string;
  createdAt: string;
}

export interface DecisionSink {
  write(decisions: JevDecision[]): Promise<void>;
}

export class MemoryDecisionSink implements DecisionSink {
  readonly decisions: JevDecision[] = [];
  async write(decisions: JevDecision[]): Promise<void> {
    this.decisions.push(...decisions);
  }
}

export function decisionRecord(input: Omit<JevDecision, "questionType" | "instructions" | "options" | "createdAt"> & { question: Question; now?: Date }): JevDecision {
  const { question, now, ...rest } = input;
  return {
    ...rest,
    questionType: question.type,
    instructions: question.instructions ?? null,
    options: question.type === "noul" ? (question.criteria ?? null) : question.criteria,
    createdAt: (now ?? new Date()).toISOString(),
  };
}
