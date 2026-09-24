// Fuentes del plano de control: Google Sheets (si está configurado) o los CSV del repositorio.
// El runtime nunca llama a esto: solo `npm run catalog:compile`.
import fs from "node:fs";
import path from "node:path";
import { parseCsv, toCsv } from "../src/catalog/csv";
import type { SheetRows } from "../src/catalog/schema";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const SOURCE_DIR = path.join(ROOT, "catalog", "source");
export const TABS = { Fields: "fields.csv", Parallel_Packs: "parallel_packs.csv", Adjudication_Rules: "adjudication_rules.csv" } as const;

export function readCsvSources(dir = SOURCE_DIR): SheetRows {
  const read = (file: string) => parseCsv(fs.readFileSync(path.join(dir, file), "utf8"));
  return { Fields: read(TABS.Fields), Parallel_Packs: read(TABS.Parallel_Packs), Adjudication_Rules: read(TABS.Adjudication_Rules) };
}

/** Descarga las tres pestañas con la API de Sheets v4 (hoja compartida con enlace + API key). */
export async function fetchSheets(sheetId: string, apiKey: string): Promise<SheetRows> {
  const get = async (tab: string): Promise<string[][]> => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(tab)}?key=${encodeURIComponent(apiKey)}&valueRenderOption=FORMATTED_VALUE`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Sheets: no se pudo leer la pestaña ${tab} (HTTP ${res.status})`);
    const body = (await res.json()) as { values?: unknown[][] };
    return (body.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
  };
  const [Fields, Parallel_Packs, Adjudication_Rules] = await Promise.all([get("Fields"), get("Parallel_Packs"), get("Adjudication_Rules")]);
  return { Fields, Parallel_Packs, Adjudication_Rules };
}

/** Guarda lo descargado como CSV para que el cambio se revise en el control de versiones. */
export function writeCsvSources(rows: SheetRows, dir = SOURCE_DIR): void {
  for (const [tab, file] of Object.entries(TABS) as Array<[keyof SheetRows, string]>) {
    const width = rows[tab][0]?.length ?? 0;
    const padded = rows[tab].map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
    fs.writeFileSync(path.join(dir, file), toCsv(padded));
  }
}
