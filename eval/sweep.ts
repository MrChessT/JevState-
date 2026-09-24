// npm run eval:sweep [-- archivo.jsonl]
// Barrido de umbrales por clave de puerta sobre decisiones etiquetadas (las que escribe eval:jev
// en eval/.tmp/decisiones.jsonl): para cada umbral act, cobertura (cuántas veces se actúa) y
// precisión cuando se actúa. Sirve para elegir act y ask con datos, no a ojo.
import fs from "node:fs";
import path from "node:path";

export interface DecisionEtiquetada {
  gate: string;
  /** Confianza de la choice, o p(sí) de la noul. */
  value: number;
  /** ¿La opción más probable era la correcta? */
  correct: boolean;
  /** Para noul «sí es malo»: se invierte el sentido. */
  inverted?: boolean;
}

export interface FilaBarrido {
  act: number;
  coverage: number;
  precision: number;
  n: number;
}

export const STEPS = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

export function sweep(decisions: DecisionEtiquetada[], steps = STEPS): Map<string, FilaBarrido[]> {
  const byGate = new Map<string, DecisionEtiquetada[]>();
  for (const d of decisions) byGate.set(d.gate, [...(byGate.get(d.gate) ?? []), d]);
  const out = new Map<string, FilaBarrido[]>();
  for (const [gate, list] of byGate) {
    out.set(
      gate,
      steps.map((act) => {
        const acted = list.filter((d) => (d.inverted ? 1 - d.value : d.value) >= act);
        return {
          act,
          n: list.length,
          coverage: list.length === 0 ? 0 : acted.length / list.length,
          precision: acted.length === 0 ? 1 : acted.filter((d) => d.correct).length / acted.length,
        };
      }),
    );
  }
  return out;
}

/** Umbral más bajo con precisión ≥ objetivo (máxima cobertura sin perder precisión). */
export function recommend(rows: FilaBarrido[], targetPrecision: number): number | null {
  const ok = rows.filter((r) => r.precision >= targetPrecision && r.coverage > 0);
  return ok.length ? Math.min(...ok.map((r) => r.act)) : null;
}

function main() {
  const file = process.argv[2] ?? path.resolve(import.meta.dirname, ".tmp", "decisiones.jsonl");
  if (!fs.existsSync(file)) {
    console.log(`[sweep] No hay decisiones etiquetadas en ${file}. Ejecuta antes \`npm run eval:jev\`.`);
    return;
  }
  const decisions = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DecisionEtiquetada);
  for (const [gate, rows] of sweep(decisions)) {
    console.log(`\n## ${gate} (${rows[0]?.n ?? 0} decisiones) · recomendado para 98 %: ${recommend(rows, 0.98) ?? "—"}`);
    console.log("| act | cobertura | precisión |\n| --- | --- | --- |");
    for (const r of rows) console.log(`| ${r.act} | ${(r.coverage * 100).toFixed(0)} % | ${(r.precision * 100).toFixed(1)} % |`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
