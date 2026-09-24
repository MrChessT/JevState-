// Métricas en memoria desde el arranque (sección 6): latencia por etapa, tokens, caché, coste y
// resultados de las puertas. Ventana deslizante de las últimas N muestras por serie.
import Decimal from "decimal.js";
import type { GateOutcome } from "@/gates/gate";
import type { JevPurpose } from "@/jev/port";

/** Etapas de un mensaje del asistente (sección 6) y del pipeline de datos. */
export const STAGES = ["extraer", "jev1", "filtrar", "jev2", "render", "total", "sde.pack", "sde.total"] as const;
export type Stage = (typeof STAGES)[number];

const WINDOW = 1000;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}


export class Metrics {
  readonly since = new Date().toISOString();
  readonly #latency = new Map<string, number[]>();
  readonly jev = { calls: 0, cacheHits: 0, errors: 0, inputTokens: 0, outputTokens: 0 };
  readonly jevByPurpose = new Map<string, { calls: number; inputTokens: number }>();
  readonly jevErrors = new Map<string, number>();
  readonly gates: Record<GateOutcome, number> = { actuar: 0, confirmar: 0, preguntar: 0 };
  readonly gatesByKey = new Map<string, Record<GateOutcome, number>>();

  constructor(private readonly pricePerMtokUsd = "0.042") {}

  recordLatency(series: Stage | string, ms: number): void {
    const samples = this.#latency.get(series) ?? [];
    samples.push(ms);
    if (samples.length > WINDOW) samples.shift();
    this.#latency.set(series, samples);
  }

  recordJev(purpose: JevPurpose, usage: { input_tokens: number; output_tokens: number }, cached: boolean, latencyMs: number): void {
    if (cached) {
      this.jev.cacheHits += 1;
      return;
    }
    this.jev.calls += 1;
    this.jev.inputTokens += usage.input_tokens;
    this.jev.outputTokens += usage.output_tokens;
    const key = purpose.startsWith("sde.") ? "sde" : purpose;
    const agg = this.jevByPurpose.get(key) ?? { calls: 0, inputTokens: 0 };
    agg.calls += 1;
    agg.inputTokens += usage.input_tokens;
    this.jevByPurpose.set(key, agg);
    this.recordLatency(`jev:${key}`, latencyMs);
  }

  recordJevError(code: string): void {
    this.jev.errors += 1;
    this.jevErrors.set(code, (this.jevErrors.get(code) ?? 0) + 1);
  }

  recordGate(key: string, outcome: GateOutcome): void {
    this.gates[outcome] += 1;
    const byKey = this.gatesByKey.get(key) ?? { actuar: 0, confirmar: 0, preguntar: 0 };
    byKey[outcome] += 1;
    this.gatesByKey.set(key, byKey);
  }

  latency(series: string): { p50: number; p95: number; n: number } {
    const sorted = [...(this.#latency.get(series) ?? [])].sort((a, b) => a - b);
    return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), n: sorted.length };
  }

  snapshot() {
    return {
      since: this.since,
      latencyMs: Object.fromEntries([...this.#latency.keys()].sort().map((series) => [series, this.latency(series)])),
      jev: {
        ...this.jev,
        estimatedCostUsd: new Decimal(this.jev.inputTokens).div(1_000_000).mul(this.pricePerMtokUsd).toFixed(6),
        cacheHitRate: this.jev.calls + this.jev.cacheHits === 0 ? 0 : this.jev.cacheHits / (this.jev.calls + this.jev.cacheHits),
        byPurpose: Object.fromEntries(this.jevByPurpose),
        errorsByCode: Object.fromEntries(this.jevErrors),
      },
      gates: { total: { ...this.gates }, byKey: Object.fromEntries(this.gatesByKey) },
    };
  }
}

/** Cronómetro de etapas de un mensaje o de un inmueble en el pipeline. */
export class StageTimer {
  readonly #start = performance.now();
  readonly durations: Partial<Record<Stage, number>> = {};

  async time<T>(stage: Stage, fn: () => Promise<T> | T): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.durations[stage] = (this.durations[stage] ?? 0) + Math.round(performance.now() - t0);
    }
  }

  elapsed(): number {
    return Math.round(performance.now() - this.#start);
  }

  flush(metrics: Metrics, totalStage: Stage = "total"): Partial<Record<Stage, number>> {
    for (const [stage, ms] of Object.entries(this.durations)) metrics.recordLatency(stage, ms);
    const total = this.elapsed();
    metrics.recordLatency(totalStage, total);
    return { ...this.durations, [totalStage]: total };
  }
}
