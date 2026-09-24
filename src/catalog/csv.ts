/** Parser CSV RFC 4180 (comillas dobles, comas y saltos de línea dentro de campos). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("CSV mal formado: comillas sin cerrar");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function toCsv(rows: string[][]): string {
  const escape = (cell: string) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map((r) => r.map(escape).join(",")).join("\n") + "\n";
}

/** Filas → objetos por cabecera. Exige exactamente las columnas esperadas (en cualquier orden). */
export function toRecords(rows: string[][], expected: readonly string[], sheet: string): Array<Record<string, string>> {
  const [header, ...body] = rows;
  if (!header) throw new Error(`${sheet}: la hoja está vacía`);
  const cols = header.map((h) => h.trim());
  const missing = expected.filter((c) => !cols.includes(c));
  const extra = cols.filter((c) => !expected.includes(c));
  if (missing.length || extra.length) {
    throw new Error(`${sheet}: columnas incorrectas.${missing.length ? ` Faltan: ${missing.join(", ")}.` : ""}${extra.length ? ` Sobran: ${extra.join(", ")}.` : ""}`);
  }
  return body.map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? "").trim()])));
}
