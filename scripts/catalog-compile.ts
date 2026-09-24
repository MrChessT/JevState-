// npm run catalog:compile [-- --check] [-- --sheets]
//
//  1. Lee el plano de control: Google Sheets (--sheets o CATALOG_SHEET_ID) o catalog/source/*.csv.
//  2. Valida con zod: tipos, ids únicos, referencias entre pestañas, textos en inglés, claves en español.
//  3. Escribe catalog/compiled.json y src/catalog/generated.ts; sube la versión si cambió el contenido.
//  4. Versiona también el catálogo de preguntas del asistente (src/asistente/catalogo.version.json).
//  5. Regenera docs/CATALOGO_JEV.md.
//  6. Ejecuta la evaluación sin Jev y FALLA si baja la precisión o sube la tasa de datos inventados.
//
// --check (CI): no escribe nada; falla si algún archivo generado no coincide con lo versionado.
import fs from "node:fs";
import path from "node:path";
import { CatalogError, compileCatalog, versionFor, type CompiledCatalog } from "../src/catalog/schema";
import { stableHash } from "../src/jev/stable";
import { contenidoCatalogo } from "../src/asistente/catalogo";
import { fetchSheets, readCsvSources, ROOT, writeCsvSources } from "./catalog-sources";
import { renderCatalogDoc } from "./catalog-docs";
import { compareWithBaseline, runSuites, readBaseline } from "../eval/framework";
import { SUITES_SIN_JEV } from "../eval/suites";

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");

const COMPILED = path.join(ROOT, "catalog", "compiled.json");
const GENERATED = path.join(ROOT, "src", "catalog", "generated.ts");
const ASSISTANT_VERSION = path.join(ROOT, "src", "asistente", "catalogo.version.json");
const DOC = path.join(ROOT, "docs", "CATALOGO_JEV.md");

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function renderGenerated(catalog: CompiledCatalog): string {
  const union = (values: string[]) => values.map((v) => JSON.stringify(v)).join(" | ") || "never";
  const enums = catalog.fields
    .filter((f) => f.enumValues)
    .map((f) => `  ${f.id}: ${union(f.enumValues!)};`)
    .join("\n");
  return `// ARCHIVO GENERADO por \`npm run catalog:compile\`. No editar a mano.
// Catálogo ${catalog.version}

export const CATALOG_VERSION = ${JSON.stringify(catalog.version)};

export type FieldId = ${union(catalog.fields.map((f) => f.id))};

export type PackId = ${union(catalog.packs.map((p) => p.id))};

/** Valores de los campos enum y ordinal. */
export interface EnumValues {
${enums}
}
`;
}

const pending: Array<{ file: string; content: string }> = [];
function emit(file: string, content: string) {
  pending.push({ file, content });
}

async function main() {
  const useSheets = args.has("--sheets") || Boolean(process.env.CATALOG_SHEET_ID);
  let sheets;
  if (useSheets) {
    const id = process.env.CATALOG_SHEET_ID;
    const key = process.env.CATALOG_SHEET_API_KEY;
    if (!id || !key) throw new Error("Faltan CATALOG_SHEET_ID y CATALOG_SHEET_API_KEY para leer Google Sheets");
    console.log("Leyendo el plano de control desde Google Sheets…");
    sheets = await fetchSheets(id, key);
  } else {
    console.log("Leyendo el plano de control desde catalog/source/*.csv (sin Sheets configurado)…");
    sheets = readCsvSources();
  }

  const body = compileCatalog(sheets);
  const previous = readJson<CompiledCatalog>(COMPILED);
  const { version, hash } = versionFor(body, previous);
  const catalog: CompiledCatalog = { version, hash, ...body };
  emit(COMPILED, JSON.stringify(catalog, null, 2) + "\n");
  emit(GENERATED, renderGenerated(catalog));

  const assistantHash = stableHash(contenidoCatalogo());
  const prevAssistant = readJson<{ version: string; hash: string }>(ASSISTANT_VERSION);
  const assistant = prevAssistant?.hash === assistantHash ? prevAssistant : { version: `${new Date().toISOString().slice(0, 10)}.${assistantHash.slice(0, 8)}`, hash: assistantHash };
  emit(ASSISTANT_VERSION, JSON.stringify(assistant, null, 2) + "\n");
  emit(DOC, renderCatalogDoc(catalog, assistant.version));

  const changed = pending.filter(({ file, content }) => {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    return current !== content;
  });

  if (CHECK) {
    if (changed.length > 0) {
      console.error(`Los archivos generados no están al día. Ejecuta \`npm run catalog:compile\` y versiona:\n  ${changed.map((c) => path.relative(ROOT, c.file)).join("\n  ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Catálogo al día (datos ${catalog.version}, asistente ${assistant.version}).`);
  } else {
    if (useSheets) writeCsvSources(sheets);
    for (const { file, content } of changed) fs.writeFileSync(file, content);
    console.log(`Catálogo de datos ${catalog.version}${previous?.version !== catalog.version ? " (NUEVA versión)" : ""}; asistente ${assistant.version}${prevAssistant?.version !== assistant.version ? " (NUEVA versión)" : ""}.`);
    for (const c of changed) console.log(`  escrito ${path.relative(ROOT, c.file)}`);
  }

  // La evaluación usa el catálogo recién compilado (no el que hubiera en disco).
  const results = await runSuites(SUITES_SIN_JEV, { catalog });
  const verdict = compareWithBaseline(results, readBaseline());
  for (const line of verdict.lines) console.log(line);
  if (!verdict.ok) {
    console.error("La evaluación empeora respecto a eval/baseline.json: no se acepta el catálogo.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  if (err instanceof CatalogError) console.error(err.message);
  else console.error(err);
  process.exitCode = 1;
});
