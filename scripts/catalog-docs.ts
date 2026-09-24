// Genera docs/CATALOGO_JEV.md desde la fuente de verdad (src/asistente/catalogo.ts,
// src/gates/thresholds.ts y catalog/compiled.json). Lo llama catalog:compile; también se puede
// ejecutar solo con `npm run catalog:docs`.
import fs from "node:fs";
import path from "node:path";
import type { ChoiceCriteria, EntryType, Question } from "@typesafe-ai/sdk";
import { PREGUNTAS, TEXTOS, ENCAJE_PUNTOS } from "../src/asistente/catalogo";
import { DEFAULT_THRESHOLDS, HIGH_RISK_ACT, LITERAL_RELAX, type GateKey } from "../src/gates/thresholds";
import { POLITICAS } from "../src/gates/policy";
import type { CompiledCatalog } from "../src/catalog/schema";

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function instructionText(q: Question): string {
  const ins = q.instructions as EntryType | undefined;
  if (typeof ins === "string") return ins;
  if (ins && typeof ins === "object" && !Array.isArray(ins) && typeof ins.question === "string") {
    const extra = Object.keys(ins).filter((k) => k !== "question");
    return `${ins.question}${extra.length ? ` *(+ ${extra.map((k) => `\`${k}\``).join(", ")})*` : ""}`;
  }
  return JSON.stringify(ins);
}

function optionsList(q: Question): string {
  if (q.type === "choice") {
    return Object.entries(q.criteria as ChoiceCriteria)
      .map(([k, v]) => `\`${k}\`: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("<br>");
  }
  if (q.type === "noul") return q.criteria ? `**sí**: ${q.criteria.true}<br>**no**: ${q.criteria.false}` : "—";
  return (q.criteria as readonly EntryType[]).map((c) => String(c)).join("<br>");
}

function gateText(key: GateKey): string {
  const g = DEFAULT_THRESHOLDS[key];
  const dir = g.direction === "si_malo" ? "alarma: se sigue si p ≤ act; se para si p > ask" : g.direction === "si_bueno" ? "p(sí) ≥ act" : "confianza ≥ act";
  return `\`${key}\`: act ${g.act} / ask ${g.ask}${g.minMargin !== undefined ? ` / margen ${g.minMargin}` : ""} (${dir})`;
}

const ASISTENTE: Array<{ id: string; cuando: string; build: () => { gate: GateKey; pregunta: Question } }> = [
  { id: "intencion", cuando: "Siempre", build: PREGUNTAS.intencion },
  { id: "operacion", cuando: "Si el código detecta pistas de compra o alquiler", build: PREGUNTAS.operacion },
  { id: "zona_i", cuando: "Por cada zona candidata del diccionario (búsqueda difusa con erratas y alias)", build: () => PREGUNTAS.zona("<mención>", [{ clave: "<slug_zona>", descripcion: "<Nombre (nivel, municipio)>" }]) },
  { id: "tipo", cuando: "Si hay pistas de tipo de inmueble", build: PREGUNTAS.tipo },
  { id: "presupuesto_ok_i", cuando: "Por cada cifra candidata extraída por el código", build: () => PREGUNTAS.presupuesto_ok("<importe normalizado>", "<literal>") },
  { id: "presupuesto_tipo", cuando: "Si hay una cifra", build: () => PREGUNTAS.presupuesto_tipo("<importe>") },
  { id: "requisito_i", cuando: "Por cada característica detectada", build: () => PREGUNTAS.requisito("<característica>") },
  { id: "proximidad_i", cuando: "Por cada concepto de proximidad (playa, colegio, transporte…)", build: () => PREGUNTAS.proximidad("<lugar>") },
  { id: "prioridad", cuando: "Si hay texto libre de motivos", build: PREGUNTAS.prioridad },
  { id: "perfil_declarado", cuando: "Solo si el usuario dice para qué o para quién es", build: PREGUNTAS.perfil_declarado },
  { id: "inmueble_ref", cuando: "Si se menciona un inmueble (ref., «el segundo», «este»)", build: () => PREGUNTAS.inmueble_ref([{ clave: "<ref>", descripcion: "<resumen de la tarjeta>" }]) },
  { id: "campo_pregunta", cuando: "Si la intención es detalle_inmueble", build: () => PREGUNTAS.campo_pregunta([{ clave: "<campo>", descripcion: "<etiqueta en inglés>" }]) },
  { id: "feedback_motivo", cuando: "Si es feedback sobre un resultado", build: PREGUNTAS.feedback_motivo },
  { id: "seguimiento", cuando: "Si hay una ficha de búsqueda previa", build: PREGUNTAS.seguimiento },
  { id: "borrador", cuando: "Si hay un borrador pendiente", build: PREGUNTAS.borrador },
  { id: "ambiguo", cuando: "Siempre", build: PREGUNTAS.ambiguo },
  { id: "inyeccion", cuando: "Siempre", build: PREGUNTAS.inyeccion },
];

const LLAMADA2: typeof ASISTENTE = [
  { id: "encaje_<ref>", cuando: "Por candidato del top 10-15, solo si hay criterios subjetivos o texto libre", build: () => PREGUNTAS.encaje("<ref>") },
  { id: "deseable_<ref>_<rasgo>", cuando: "Por cada deseable sin campo estructurado fiable (con peso > 0)", build: () => PREGUNTAS.deseable("<ref>", "<rasgo>") },
];

const VALORACION: typeof ASISTENTE = [
  { id: "comparable_<id>", cuando: "Por comparable", build: () => PREGUNTAS.comparable("<id>") },
  { id: "ajuste_estado", cuando: "Si hay descripción del estado", build: PREGUNTAS.ajuste_estado },
];

function tablaPreguntas(rows: typeof ASISTENTE): string {
  const lines = ["| id | tipo | cuándo | texto (en) | opciones | puerta |", "| --- | --- | --- | --- | --- | --- |"];
  for (const r of rows) {
    const { gate, pregunta } = r.build();
    lines.push(`| \`${r.id}\` | ${pregunta.type} | ${esc(r.cuando)} | ${esc(instructionText(pregunta))} | ${esc(optionsList(pregunta))} | ${esc(gateText(gate))} |`);
  }
  return lines.join("\n");
}

export function renderCatalogDoc(catalog: CompiledCatalog, assistantVersion: string): string {
  const t = DEFAULT_THRESHOLDS;
  const packs = catalog.packs
    .map((p) => `| \`${p.id}\` | ${p.stage} | ${p.maxConcurrency} | ${p.condition ? `\`${p.condition.field} ${p.condition.op} ${p.condition.values.join(", ")}\`` : "—"} | ${p.fields.map((f) => `\`${f}\``).join(", ")} |`)
    .join("\n");
  const fieldsByPack = catalog.packs
    .map((p) => {
      const rows = p.fields.map((id) => {
        const f = catalog.fields.find((x) => x.id === id)!;
        const opts = f.options ? Object.entries(f.options).map(([k, v]) => `\`${k}\`: ${v}`).join("<br>") : f.criteria ? `**sí**: ${f.criteria.true}<br>**no**: ${f.criteria.false}` : "—";
        const jev = f.type === "text" ? "Nunca (literal de la fuente)" : f.type === "boolean" ? "noul" : f.type === "enum" ? "choice + `no_consta`" : f.type === "ordinal" ? "score" : "noul (verify) / choice entre candidatos + `ninguno`";
        return `| \`${f.id}\` | ${f.type}${f.unit ? ` (${f.unit})` : ""} | ${jev} | ${esc(f.question ?? "—")} | ${esc(opts)} | ${f.gate.act} / ${f.gate.ask} | ${f.public ? "sí" : "no"} | ${f.filterable ? "sí" : "no"} | ${f.requiredForPublish ? (f.requiredExcept ? `sí, salvo ${f.requiredExcept.field} ∈ {${f.requiredExcept.values.join(", ")}}` : "sí") : "no"} | ${f.extractors.join(", ")} |`;
      });
      return `#### Paquete \`${p.id}\` (${p.stage})\n\n| campo | tipo | Jev | pregunta (en) | opciones / criterios | act / ask | público | filtro | obligatorio | extractores |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}`;
    })
    .join("\n\n");
  const rules = catalog.adjudication
    .map((r) => `| \`${r.field}\` | ${r.sourcePriority.join(" > ")} | ${r.tolerance.kind === "relative" ? `±${r.tolerance.value} %` : `±${r.tolerance.value}`} | ${esc(Object.entries(r.reasons).map(([k, v]) => `\`${k}\`: ${v}`).join("<br>"))} | ${r.onLowConfidence} |`)
    .join("\n");
  const politicas = Object.entries(POLITICAS)
    .map(([a, p]) => `| \`${a}\` | ${p.requeridos.map((r) => (Array.isArray(r) ? r.join(" **o** ") : r)).join(", ")} | ${p.opcionales.join(", ") || "—"} | ${p.irrelevantes.join(", ") || "—"} | ${p.riesgo} | ${p.anteLaDuda} | \`${p.umbralIntencion}\` |`)
    .join("\n");

  return `# Catálogo de preguntas a Jev y umbrales

> **Archivo generado** por \`npm run catalog:compile\` desde \`src/asistente/catalogo.ts\`, \`src/gates/thresholds.ts\`, \`src/gates/policy.ts\` y \`catalog/compiled.json\`. No se edita a mano: se cambia la fuente y se vuelve a compilar.

| Catálogo | Versión |
| --- | --- |
| Datos (campos, paquetes, adjudicación) | \`${catalog.version}\` |
| Asistente (llamadas 1 y 2, valoración) | \`${assistantVersion}\` |

Reglas del catálogo:

- **Jev solo responde preguntas cerradas**: \`choice\`, \`noul\` y \`score\` (comprobado en los tipos de \`@typesafe-ai/sdk\` 0.6.0). No produce cifras ni texto libre.
- **Idioma**: instrucciones y descripciones en inglés; claves de las opciones en español; el mensaje del usuario va en el \`state\`, sin traducir. \`catalog:compile\` rechaza texto con señales de español y claves en inglés.
- **Versión**: cualquier cambio de texto cambia el hash y la versión. La versión entra en la clave de caché de Jev y en cada decisión auditada.
- **Medir antes de ajustar**: ningún umbral ni texto cambia sin pasar \`npm run eval\` (y, con Jev real, \`npm run eval:jev\` + \`npm run eval:sweep\`).

## 1. Puertas

Resultado de una puerta: **actuar** (≥ act), **confirmar** (entre ask y act) o **preguntar** (< ask). En las alarmas (\`ambiguo\`, \`inyeccion\`) el sentido se invierte. Todos los umbrales viven en \`src/gates/thresholds.ts\` y se sobrescriben por entorno con \`GATE_<CLAVE>_ACT\`, \`GATE_<CLAVE>_ASK\` y \`GATE_<CLAVE>_MARGIN\`.

- **Evidencia literal**: si el dato aparece tal cual en el mensaje, act y ask bajan ${LITERAL_RELAX} y el margen mínimo se reduce a la mitad. Nunca en acciones de riesgo alto ni en alarmas.
- **Riesgo alto** (pedir visita, contactar): el umbral de actuar nunca baja de ${HIGH_RISK_ACT}, y aun así se muestra siempre un borrador que el usuario confirma. Nada se envía por inferencia.

| clave | act | ask | margen | sentido |
| --- | --- | --- | --- | --- |
${(Object.keys(t) as GateKey[]).map((k) => `| \`${k}\` | ${t[k].act} | ${t[k].ask} | ${t[k].minMargin ?? "—"} | ${t[k].direction} |`).join("\n")}

### Política por acción (sección 4.3)

| acción | requeridos | opcionales | irrelevantes (no se preguntan ni se muestran) | riesgo | ante la duda | umbral de intención |
| --- | --- | --- | --- | --- | --- | --- |
${politicas}

## 2. Asistente, llamada 1: entender (máx. 1 petición \`systemOne\`)

Solo se pregunta lo que el mensaje puede contestar: el código decide qué preguntas enviar según lo que ha extraído (cifras, zonas candidatas, características, conceptos de proximidad, inmuebles mencionados) y el contexto (ficha de búsqueda previa, borrador pendiente, inmueble visto).

${tablaPreguntas(ASISTENTE)}

Notas:

- \`perfil_declarado\` solo se envía si el usuario dice para qué o para quién es la vivienda, y nunca se infiere de la edad, el origen, el idioma, el nombre ni ninguna característica protegida. No se filtra por la composición del vecindario.
- Las respuestas a una aclaración («¿qué presupuesto?» → «unos 250») las resuelve el código sin volver a Jev.
- \`inyeccion\` > ${t.inyeccion.ask}: el asistente se detiene y responde con una plantilla.

## 3. Asistente, llamada 2: juzgar el encaje (máx. 1 petición)

Solo si hay criterios subjetivos o texto libre que valorar. El \`state\` lleva la ficha canónica **resumida** de cada candidato (campos + confianza), no la descripción completa.

${tablaPreguntas(LLAMADA2)}

Conversión del encaje a puntos (nivel 0-4): ${ENCAJE_PUNTOS.map((p, i) => `${i} → ${p}`).join(", ")}. Los pesos salen de las prioridades que el usuario ha dicho; con peso 0 no se pregunta.

## 4. Valoración (sección 5)

${tablaPreguntas(VALORACION)}

El nivel de \`ajuste_estado\` (0-4 = −2…+2) se convierte a porcentaje con una tabla configurable del plano de control. El número lo pone siempre el código (comparables con decimal.js).

## 5. Pipeline de datos (SDE): campos por paquete

Cada paquete va en **una** petición \`systemOne\`; los paquetes de un inmueble se lanzan en paralelo con límite de concurrencia. Cascada: **mini** (código, sin Jev) → **verify** (noul sobre el candidato estructurado) → **reasoning** (choice/score/noul sobre el texto libre).

| paquete | etapa | concurrencia | condición | campos |
| --- | --- | --- | --- | --- |
${packs}

${fieldsByPack}

## 6. Reglas de adjudicación

Si las evidencias chocan fuera de tolerancia, se pregunta \`<campo>__candidato\` (choice entre los candidatos + \`ninguno\`) y \`<campo>__motivo\` (choice con estas opciones). Con confianza por debajo del umbral del campo se aplica \`on_low_confidence\`.

| campo | prioridad de fuentes | tolerancia | motivos | con poca confianza |
| --- | --- | --- | --- | --- |
${rules}

## 7. Texto completo de las instrucciones (para revisión)

${Object.entries(TEXTOS).map(([k, v]) => `- \`${k}\`: ${v}`).join("\n")}
`;
}

async function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "compiled.json"), "utf8")) as CompiledCatalog;
  const assistant = JSON.parse(fs.readFileSync(path.join(root, "src", "asistente", "catalogo.version.json"), "utf8")) as { version: string };
  fs.writeFileSync(path.join(root, "docs", "CATALOGO_JEV.md"), renderCatalogDoc(catalog, assistant.version));
  console.log("docs/CATALOGO_JEV.md regenerado.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
