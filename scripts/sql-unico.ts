// Junta todas las migraciones en un solo archivo para pegarlo en el SQL Editor de Supabase
// (instalación sin la CLI). Las migraciones son repetibles: se puede volver a ejecutar entero.
// Uso: npm run db:sql-unico   ·   --check falla si el archivo no está al día (CI / tests).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const SALIDA = "supabase/instalar.sql";

export function sqlUnico(dir = DIR): string {
  const archivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const partes = archivos.map((f) => `-- ===== ${f} =====\n${readFileSync(join(dir, f), "utf8").trimEnd()}\n`);
  return `-- GENERADO con \`npm run db:sql-unico\`: no editar a mano (se edita supabase/migrations/).\n-- Pegar entero en Supabase → SQL Editor → Run. Se puede repetir sin error.\n\n${partes.join("\n")}`;
}

if (process.argv[1]?.endsWith("sql-unico.ts")) {
  const sql = sqlUnico();
  if (process.argv.includes("--check")) {
    if (readFileSync(SALIDA, "utf8") !== sql) {
      console.error(`${SALIDA} no está al día: ejecuta npm run db:sql-unico`);
      process.exit(1);
    }
  } else {
    writeFileSync(SALIDA, sql);
    console.log(`${SALIDA}: ${sql.length} caracteres`);
  }
}
