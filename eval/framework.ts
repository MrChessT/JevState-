// Marco de evaluación (sección 8). Cada suite devuelve casos acertados o fallados, y marca los
// «datos inventados» (un valor que no sale de ninguna evidencia). La línea base
// (eval/baseline.json) fija la precisión mínima por suite; los datos inventados deben ser 0.
import fs from "node:fs";
import path from "node:path";
import type { CompiledCatalog } from "../src/catalog/schema";
import type { JevPort } from "../src/jev/port";

export interface SuiteContext {
  catalog: CompiledCatalog;
  /** Solo en las suites que usan Jev real (`npm run eval:jev`). */
  jev?: JevPort;
}

export interface CaseResult {
  id: string;
  ok: boolean;
  /** El sistema afirmó un dato que no estaba en la evidencia. Tolerancia: cero. */
  invented?: boolean;
  detail?: string;
}

export interface Suite {
  id: string;
  description: string;
  requiresJev?: boolean;
  run(ctx: SuiteContext): Promise<CaseResult[]>;
}

export interface SuiteResult {
  id: string;
  description: string;
  total: number;
  correct: number;
  invented: number;
  precision: number;
  inventedRate: number;
  failures: CaseResult[];
}

export interface Baseline {
  suites: Record<string, { precision: number; inventedRate: number; total: number }>;
}

export const BASELINE_FILE = path.resolve(import.meta.dirname, "baseline.json");

export async function runSuites(suites: Suite[], ctx: SuiteContext): Promise<SuiteResult[]> {
  const results: SuiteResult[] = [];
  for (const suite of suites) {
    const cases = await suite.run(ctx);
    const correct = cases.filter((c) => c.ok).length;
    const invented = cases.filter((c) => c.invented).length;
    results.push({
      id: suite.id,
      description: suite.description,
      total: cases.length,
      correct,
      invented,
      precision: cases.length === 0 ? 1 : correct / cases.length,
      inventedRate: cases.length === 0 ? 0 : invented / cases.length,
      failures: cases.filter((c) => !c.ok || c.invented),
    });
  }
  return results;
}

export function readBaseline(file = BASELINE_FILE): Baseline {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Baseline;
  } catch {
    return { suites: {} };
  }
}

export function toBaseline(results: SuiteResult[]): Baseline {
  return {
    suites: Object.fromEntries(
      results.map((r) => [r.id, { precision: round4(r.precision), inventedRate: round4(r.inventedRate), total: r.total }]),
    ),
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

const pct = (n: number) => `${(n * 100).toFixed(1)} %`;

/** ¿Empeora algo? Baja la precisión, sube la tasa de inventados, o hay algún inventado. */
export function compareWithBaseline(results: SuiteResult[], baseline: Baseline): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  for (const r of results) {
    const ref = baseline.suites[r.id];
    const head = `[eval] ${r.id}: ${r.correct}/${r.total} (${pct(r.precision)}), inventados ${r.invented}`;
    if (r.invented > 0) {
      ok = false;
      lines.push(`${head}  ✗ hay datos inventados (tolerancia cero)`);
    } else if (!ref) {
      lines.push(`${head}  (sin línea base: \`npm run eval -- --update-baseline\`)`);
    } else if (round4(r.precision) < ref.precision) {
      ok = false;
      lines.push(`${head}  ✗ la precisión baja (antes ${pct(ref.precision)})`);
    } else if (round4(r.inventedRate) > ref.inventedRate) {
      ok = false;
      lines.push(`${head}  ✗ sube la tasa de inventados`);
    } else {
      lines.push(`${head}  ✓ (línea base ${pct(ref.precision)})`);
    }
    for (const f of r.failures.slice(0, 10)) lines.push(`    - ${f.id}: ${f.detail ?? (f.invented ? "dato inventado" : "fallo")}`);
    if (r.failures.length > 10) lines.push(`    … y ${r.failures.length - 10} más`);
  }
  return { ok, lines };
}
