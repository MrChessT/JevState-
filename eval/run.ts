// npm run eval                          → suites sin Jev (cada PR)
// npm run eval -- --update-baseline     → fija la línea base con el resultado actual
// npm run eval:jev                      → suites con Jev real (tarea manual o programada)
import fs from "node:fs";
import path from "node:path";
import compiled from "../catalog/compiled.json";
import { CompiledCatalog } from "../src/catalog/schema";
import { loadConfig } from "../src/config/env";
import { createJev } from "../src/jev/factory";
import { Metrics } from "../src/observability/metrics";
import { BASELINE_FILE, compareWithBaseline, readBaseline, runSuites, toBaseline } from "./framework";
import { SUITES_CON_JEV, SUITES_SIN_JEV } from "./suites";

const args = new Set(process.argv.slice(2));

async function main() {
  const catalog = CompiledCatalog.parse(compiled);
  const withJev = args.has("--jev");
  let jev;
  if (withJev) {
    const config = loadConfig();
    if (config.jev.via === "fake") throw new Error("eval:jev necesita TYPESAFE_API_KEY o AI_GATEWAY_API_KEY");
    jev = createJev(config, new Metrics(config.jev.pricePerMtokUsd));
  }
  const suites = withJev ? SUITES_CON_JEV : SUITES_SIN_JEV;
  if (suites.length === 0) {
    console.log("[eval] No hay suites para este modo todavía.");
    return;
  }
  const results = await runSuites(suites, { catalog, jev });
  const out = path.resolve(import.meta.dirname, ".tmp");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `resultados-${withJev ? "jev" : "sin-jev"}.json`), JSON.stringify(results, null, 2));

  if (args.has("--update-baseline")) {
    const baseline = readBaseline();
    const merged = { suites: { ...baseline.suites, ...toBaseline(results).suites } };
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(merged, null, 2) + "\n");
    console.log(`[eval] Línea base actualizada en ${path.relative(process.cwd(), BASELINE_FILE)}`);
  }
  const verdict = compareWithBaseline(results, readBaseline());
  for (const line of verdict.lines) console.log(line);
  if (!verdict.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
