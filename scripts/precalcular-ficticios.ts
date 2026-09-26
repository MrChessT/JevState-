// Precalcula los 300 inmuebles ficticios (src/portal/ficticios.json) para que el portal los cargue
// al instante en vez de generarlos en cada arranque del servidor. `--check` falla si están desfasados.
import { readFileSync, writeFileSync } from "node:fs";
import { generarFichasFicticias } from "@/portal/repo-memoria";

const RUTA = "src/portal/ficticios.json";
const json = `${JSON.stringify(await generarFichasFicticias(300))}\n`;
if (process.argv.includes("--check")) {
  const actual = readFileSync(RUTA, "utf8");
  if (actual !== json) {
    console.error(`${RUTA} está desfasado: ejecuta npm run ficticios:precalcular`);
    process.exit(1);
  }
  console.log(`${RUTA} al día`);
} else {
  writeFileSync(RUTA, json);
  console.log(`${RUTA}: ${(json.length / 1024).toFixed(0)} KB`);
}
