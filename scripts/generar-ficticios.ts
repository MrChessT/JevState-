// npm run ficticios [-- --n 300 --salida datos/ficticios]
// Escribe el feed XML, las páginas HTML y la verdad de referencia de los inmuebles FICTICIOS.
import fs from "node:fs";
import path from "node:path";
import { feedXml, generarConjunto } from "../src/ficticios/generador";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const n = Number(arg("n", "300"));
const salida = arg("salida", "datos/ficticios");
const inmuebles = generarConjunto(n);
fs.mkdirSync(path.join(salida, "paginas"), { recursive: true });
fs.writeFileSync(path.join(salida, "feed.xml"), feedXml(inmuebles));
for (const i of inmuebles) if (i.html) fs.writeFileSync(path.join(salida, "paginas", `${i.ref}.html`), i.html);
fs.writeFileSync(path.join(salida, "verdad.json"), JSON.stringify(Object.fromEntries(inmuebles.map((i) => [i.ref, { escenarios: i.escenarios, verdad: i.verdad }])), null, 2));
const escenarios = new Map<string, number>();
for (const i of inmuebles) for (const e of i.escenarios) escenarios.set(e, (escenarios.get(e) ?? 0) + 1);
console.log(`${n} inmuebles ficticios en ${salida} (${inmuebles.filter((i) => i.html).length} con página HTML).`);
console.table(Object.fromEntries([...escenarios].sort()));
