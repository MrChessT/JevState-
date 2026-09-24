// Esquema del plano de control (sección 3.4): las tres pestañas de la hoja (Fields,
// Parallel_Packs, Adjudication_Rules) → catálogo compilado. Todo se valida aquí; el runtime solo
// lee catalog/compiled.json ya validado.
import { z } from "zod";
import { stableHash } from "@/jev/stable";
import { toRecords } from "./csv";

export const FIELD_TYPES = ["boolean", "enum", "integer", "decimal", "currency", "area", "ordinal", "text"] as const;
export const NUMERIC_TYPES = ["integer", "decimal", "currency", "area"] as const;
export const SOURCES = ["feed", "jsonld", "meta", "features_table", "visible_text", "manual", "csv", "geocode"] as const;
export const EXTRACTORS = ["feed", "jsonld", "meta", "features_table", "regex", "geocode", "manual"] as const;
export const STAGES = ["verify", "reasoning"] as const;
export const ON_LOW_CONFIDENCE = ["revisar", "fuente_fuerte", "no_consta"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];
export type Source = (typeof SOURCES)[number];

/** Opciones que añade el sistema; no pueden usarse como valores del enumerado. */
export const RESERVED_KEYS = ["no_consta", "ninguno", "ninguna", "varias", "no_indicado", "no_aplica"] as const;

export const FIELD_COLUMNS = [
  "id", "type", "enum_values", "unit", "pack", "question_en", "true_en", "false_en", "options_en", "extractor",
  "gate_act", "gate_ask", "public", "filterable", "required_for_publish", "label_es", "label_en",
] as const;
export const PACK_COLUMNS = ["pack", "fields", "max_concurrency", "stage", "condition"] as const;
export const RULE_COLUMNS = ["field", "source_priority", "tolerance", "reason_options", "on_low_confidence"] as const;

// Reglas de idioma ----------------------------------------------------------

const KEY_RE = /^[a-z][a-z0-9_]*$/;
/** Palabras inglesas que delatan una clave que debería estar en español (contrato interno). */
const ENGLISH_KEYS = new Set(["yes", "no", "none", "other", "unknown", "true", "false", "included", "optional", "sale", "rent", "flat", "house", "price"]);
/** Señales de texto en español donde se espera inglés. */
const SPANISH_CHARS = /[áéíóúñ¿¡]/i;
const SPANISH_WORDS = /\b(el|los|las|del|que|una|con|para|por|tiene|vivienda|piso|está|hay|precio|zona|también)\b/i;

export function checkKey(key: string, where: string): string[] {
  const errors: string[] = [];
  if (!KEY_RE.test(key)) errors.push(`${where}: la clave «${key}» debe ser snake_case en minúsculas sin tildes`);
  if (ENGLISH_KEYS.has(key)) errors.push(`${where}: la clave «${key}» está en inglés; las claves van en español`);
  return errors;
}

/** Nombres propios españoles permitidos dentro del texto en inglés (siglas y términos legales). */
const ALLOWED_SPANISH_TERMS = /\b(IBI|VPO|okupado|nuda propiedad|sin posesión)\b/gi;

export function checkEnglish(text: string, where: string): string[] {
  const probe = text.replace(/"[^"]*"/g, "").replace(ALLOWED_SPANISH_TERMS, "");
  const errors: string[] = [];
  if (SPANISH_CHARS.test(probe) || SPANISH_WORDS.test(probe)) errors.push(`${where}: el texto debe estar en inglés: «${text}»`);
  return errors;
}

// Parseo de celdas ---------------------------------------------------------

const siNo = (value: string, where: string, errors: string[]): boolean => {
  const v = value.toLowerCase();
  if (v === "si" || v === "sí") return true;
  if (v === "no") return false;
  errors.push(`${where}: debe ser «si» o «no» (recibido «${value}»)`);
  return false;
};

const unit = (value: string, where: string, errors: string[]): number => {
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1) errors.push(`${where}: debe ser un número entre 0 y 1 (recibido «${value}»)`);
  return n;
};

/** «clave: descripción | clave: descripción» → objeto ordenado. */
export function parseOptions(value: string, where: string, errors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value) return out;
  for (const part of value.split("|")) {
    const idx = part.indexOf(":");
    if (idx < 0) {
      errors.push(`${where}: opción sin «clave: descripción»: «${part.trim()}»`);
      continue;
    }
    const key = part.slice(0, idx).trim();
    const desc = part.slice(idx + 1).trim();
    errors.push(...checkKey(key, where), ...checkEnglish(desc, `${where}.${key}`));
    if (!desc) errors.push(`${where}.${key}: falta la descripción`);
    if (key in out) errors.push(`${where}: opción repetida «${key}»`);
    out[key] = desc;
  }
  return out;
}

// Catálogo compilado (lo que lee el runtime) -----------------------------

const Gate = z.object({ act: z.number().min(0).max(1), ask: z.number().min(0).max(1) });

export const CompiledField = z.object({
  id: z.string(),
  type: z.enum(FIELD_TYPES),
  pack: z.string(),
  enumValues: z.array(z.string()).optional(),
  unit: z.string().optional(),
  question: z.string().optional(),
  criteria: z.object({ true: z.string(), false: z.string() }).optional(),
  options: z.record(z.string(), z.string()).optional(),
  extractors: z.array(z.enum(EXTRACTORS)),
  gate: Gate,
  public: z.boolean(),
  filterable: z.boolean(),
  requiredForPublish: z.boolean(),
  label: z.object({ es: z.string(), en: z.string() }),
});

export const Condition = z.object({ field: z.string(), op: z.enum(["=", "in"]), values: z.array(z.string()).min(1) });

export const CompiledPack = z.object({
  id: z.string(),
  fields: z.array(z.string()).min(1),
  maxConcurrency: z.number().int().positive(),
  stage: z.enum(STAGES),
  condition: Condition.optional(),
});

export const Tolerance = z.object({ kind: z.enum(["relative", "absolute"]), value: z.string() });

export const CompiledRule = z.object({
  field: z.string(),
  sourcePriority: z.array(z.enum(SOURCES)).min(1),
  tolerance: Tolerance,
  reasons: z.record(z.string(), z.string()),
  onLowConfidence: z.enum(ON_LOW_CONFIDENCE),
});

export const CompiledCatalog = z.object({
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}\.[0-9a-f]{8}$/),
  hash: z.string().length(64),
  fields: z.array(CompiledField),
  packs: z.array(CompiledPack),
  adjudication: z.array(CompiledRule),
});

export type CompiledField = z.infer<typeof CompiledField>;
export type CompiledPack = z.infer<typeof CompiledPack>;
export type CompiledRule = z.infer<typeof CompiledRule>;
export type CompiledCatalog = z.infer<typeof CompiledCatalog>;
export type CatalogBody = Omit<CompiledCatalog, "version" | "hash">;

export interface SheetRows {
  Fields: string[][];
  Parallel_Packs: string[][];
  Adjudication_Rules: string[][];
}

export class CatalogError extends Error {
  constructor(readonly errors: string[]) {
    super(`El catálogo tiene ${errors.length} error(es):\n  - ${errors.join("\n  - ")}`);
    this.name = "CatalogError";
  }
}

function parseCondition(value: string, where: string, errors: string[]): z.infer<typeof Condition> | undefined {
  if (!value) return undefined;
  const eq = /^\s*([a-z][a-z0-9_]*)\s*=\s*([a-z0-9_]+)\s*$/.exec(value);
  if (eq) return { field: eq[1]!, op: "=", values: [eq[2]!] };
  const inn = /^\s*([a-z][a-z0-9_]*)\s+in\s*\(([^)]*)\)\s*$/.exec(value);
  if (inn) return { field: inn[1]!, op: "in", values: inn[2]!.split(",").map((v) => v.trim()).filter(Boolean) };
  errors.push(`${where}: condición no válida «${value}» (usa «campo = valor» o «campo in (a, b)»)`);
  return undefined;
}

function parseTolerance(value: string, where: string, errors: string[]): z.infer<typeof Tolerance> {
  const m = /^(\d+(?:[.,]\d+)?)\s*(%?)$/.exec(value.trim());
  if (!m) {
    errors.push(`${where}: tolerancia no válida «${value}» (p. ej. «1%» o «0»)`);
    return { kind: "absolute", value: "0" };
  }
  return { kind: m[2] ? "relative" : "absolute", value: m[1]!.replace(",", ".") };
}

/** Valida las tres pestañas y devuelve el cuerpo del catálogo (sin versión). Lanza CatalogError. */
export function compileCatalog(sheets: SheetRows): CatalogBody {
  const errors: string[] = [];
  const fields: CompiledField[] = [];
  const seen = new Set<string>();

  for (const [i, r] of toRecords(sheets.Fields, FIELD_COLUMNS, "Fields").entries()) {
    const where = `Fields fila ${i + 2} (${r.id || "sin id"})`;
    errors.push(...checkKey(r.id!, where));
    if (seen.has(r.id!)) errors.push(`${where}: id repetido`);
    seen.add(r.id!);
    const type = r.type as FieldType;
    if (!FIELD_TYPES.includes(type)) {
      errors.push(`${where}: tipo «${r.type}» no válido (${FIELD_TYPES.join(", ")})`);
      continue;
    }
    const extractors = r.extractor!.split("+").map((e) => e.trim()).filter(Boolean);
    for (const e of extractors) if (!(EXTRACTORS as readonly string[]).includes(e)) errors.push(`${where}: extractor «${e}» no válido`);
    if (extractors.length === 0) errors.push(`${where}: falta el extractor`);

    const field: CompiledField = {
      id: r.id!,
      type,
      pack: r.pack!,
      extractors: extractors as CompiledField["extractors"],
      gate: { act: unit(r.gate_act!, `${where}.gate_act`, errors), ask: unit(r.gate_ask!, `${where}.gate_ask`, errors) },
      public: siNo(r.public!, `${where}.public`, errors),
      filterable: siNo(r.filterable!, `${where}.filterable`, errors),
      requiredForPublish: siNo(r.required_for_publish!, `${where}.required_for_publish`, errors),
      label: { es: r.label_es!, en: r.label_en! },
    };
    if (field.gate.ask > field.gate.act) errors.push(`${where}: gate_ask no puede ser mayor que gate_act`);
    if (!field.label.es || !field.label.en) errors.push(`${where}: faltan las etiquetas label_es / label_en`);
    if (r.unit) field.unit = r.unit;

    if (type === "text") {
      // Los textos nunca se generan: solo se guarda el literal de la fuente.
      if (r.question_en || r.options_en || r.true_en || r.false_en) errors.push(`${where}: un campo text no lleva pregunta a Jev`);
    } else {
      if (!r.question_en) errors.push(`${where}: falta question_en`);
      else errors.push(...checkEnglish(r.question_en, `${where}.question_en`));
      field.question = r.question_en;
    }

    if (type === "enum" || type === "ordinal") {
      const values = r.enum_values!.split("|").map((v) => v.trim()).filter(Boolean);
      if (values.length < 2) errors.push(`${where}: enum_values necesita al menos 2 valores`);
      for (const v of values) {
        errors.push(...checkKey(v, `${where}.enum_values`));
        if ((RESERVED_KEYS as readonly string[]).includes(v)) errors.push(`${where}: «${v}» es una opción reservada del sistema`);
      }
      const options = parseOptions(r.options_en!, `${where}.options_en`, errors);
      const keys = Object.keys(options);
      if (keys.join("|") !== values.join("|")) errors.push(`${where}: options_en debe describir enum_values en el mismo orden (${values.join(", ")})`);
      field.enumValues = values;
      field.options = options;
      if (r.true_en || r.false_en) errors.push(`${where}: true_en/false_en solo se usan en boolean y numéricos`);
    } else if (r.enum_values || r.options_en) {
      errors.push(`${where}: enum_values/options_en solo se usan en enum y ordinal`);
    }

    if (type === "boolean" || (NUMERIC_TYPES as readonly string[]).includes(type)) {
      if (!r.true_en || !r.false_en) errors.push(`${where}: faltan true_en y false_en`);
      else {
        errors.push(...checkEnglish(r.true_en, `${where}.true_en`), ...checkEnglish(r.false_en, `${where}.false_en`));
        field.criteria = { true: r.true_en, false: r.false_en };
      }
    }
    if ((NUMERIC_TYPES as readonly string[]).includes(type)) {
      if (!r.question_en!.includes("{candidate}")) errors.push(`${where}: la pregunta de un campo numérico debe incluir {candidate}`);
      if ((type === "currency" || type === "area") && !r.unit) errors.push(`${where}: falta la unidad`);
    }
    fields.push(field);
  }

  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const packs: CompiledPack[] = [];
  const packIds = new Set<string>();
  const fieldInPack = new Map<string, string>();
  for (const [i, r] of toRecords(sheets.Parallel_Packs, PACK_COLUMNS, "Parallel_Packs").entries()) {
    const where = `Parallel_Packs fila ${i + 2} (${r.pack || "sin nombre"})`;
    errors.push(...checkKey(r.pack!, where));
    if (packIds.has(r.pack!)) errors.push(`${where}: paquete repetido`);
    packIds.add(r.pack!);
    const list = r.fields!.split("|").map((f) => f.trim()).filter(Boolean);
    for (const f of list) {
      const field = fieldById.get(f);
      if (!field) errors.push(`${where}: el campo «${f}» no existe en Fields`);
      else if (field.pack !== r.pack) errors.push(`${where}: el campo «${f}» está en el paquete «${field.pack}» según Fields`);
      if (fieldInPack.has(f)) errors.push(`${where}: el campo «${f}» ya está en el paquete «${fieldInPack.get(f)}»`);
      fieldInPack.set(f, r.pack!);
    }
    const max = Number(r.max_concurrency);
    if (!Number.isInteger(max) || max < 1 || max > 64) errors.push(`${where}: max_concurrency debe ser un entero entre 1 y 64`);
    if (!(STAGES as readonly string[]).includes(r.stage!)) errors.push(`${where}: stage debe ser ${STAGES.join(" o ")}`);
    const condition = parseCondition(r.condition!, `${where}.condition`, errors);
    if (condition) {
      const target = fieldById.get(condition.field);
      if (!target) errors.push(`${where}: la condición usa el campo inexistente «${condition.field}»`);
      else if (target.enumValues) for (const v of condition.values) if (!target.enumValues.includes(v)) errors.push(`${where}: «${v}» no es un valor de ${target.id}`);
    }
    packs.push({ id: r.pack!, fields: list, maxConcurrency: max, stage: r.stage as CompiledPack["stage"], ...(condition ? { condition } : {}) });
  }
  for (const f of fields) {
    if (!packIds.has(f.pack)) errors.push(`Fields (${f.id}): el paquete «${f.pack}» no existe en Parallel_Packs`);
    else if (!fieldInPack.has(f.id)) errors.push(`Fields (${f.id}): no aparece en la lista de campos del paquete «${f.pack}»`);
  }

  const adjudication: CompiledRule[] = [];
  const ruled = new Set<string>();
  for (const [i, r] of toRecords(sheets.Adjudication_Rules, RULE_COLUMNS, "Adjudication_Rules").entries()) {
    const where = `Adjudication_Rules fila ${i + 2} (${r.field || "sin campo"})`;
    const field = fieldById.get(r.field!);
    if (!field) errors.push(`${where}: el campo no existe en Fields`);
    else if (!(NUMERIC_TYPES as readonly string[]).includes(field.type)) errors.push(`${where}: la adjudicación solo aplica a campos numéricos`);
    if (ruled.has(r.field!)) errors.push(`${where}: regla repetida`);
    ruled.add(r.field!);
    const priority = r.source_priority!.split(">").map((s) => s.trim()).filter(Boolean);
    for (const s of priority) if (!(SOURCES as readonly string[]).includes(s)) errors.push(`${where}: fuente «${s}» no válida`);
    if (new Set(priority).size !== priority.length) errors.push(`${where}: fuentes repetidas en source_priority`);
    const reasons = parseOptions(r.reason_options!, `${where}.reason_options`, errors);
    if (!("no_determinable" in reasons)) errors.push(`${where}: reason_options debe incluir no_determinable`);
    if (!(ON_LOW_CONFIDENCE as readonly string[]).includes(r.on_low_confidence!)) errors.push(`${where}: on_low_confidence debe ser ${ON_LOW_CONFIDENCE.join(", ")}`);
    adjudication.push({
      field: r.field!,
      sourcePriority: priority as CompiledRule["sourcePriority"],
      tolerance: parseTolerance(r.tolerance!, `${where}.tolerance`, errors),
      reasons,
      onLowConfidence: r.on_low_confidence as CompiledRule["onLowConfidence"],
    });
  }

  if (errors.length > 0) throw new CatalogError(errors);
  return { fields, packs, adjudication };
}

/** Versión: se conserva si el contenido no cambia; si cambia, fecha de hoy + hash corto. */
export function versionFor(body: CatalogBody, previous: { version: string; hash: string } | null, today: Date = new Date()): { version: string; hash: string } {
  const hash = stableHash(body);
  if (previous && previous.hash === hash) return { version: previous.version, hash };
  return { version: `${today.toISOString().slice(0, 10)}.${hash.slice(0, 8)}`, hash };
}
