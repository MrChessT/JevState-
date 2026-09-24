// Catálogo de datos en tiempo de ejecución: solo lee catalog/compiled.json (nunca Sheets en vivo).
import compiled from "@catalog/compiled.json";
import { CompiledCatalog, type CompiledField, type CompiledPack, type CompiledRule } from "./schema";

export const CATALOG: CompiledCatalog = CompiledCatalog.parse(compiled);
export const CATALOG_VERSION = CATALOG.version;

const FIELDS = new Map(CATALOG.fields.map((f) => [f.id, f]));
const RULES = new Map(CATALOG.adjudication.map((r) => [r.field, r]));
const PACKS = new Map(CATALOG.packs.map((p) => [p.id, p]));

export function field(id: string): CompiledField {
  const f = FIELDS.get(id);
  if (!f) throw new Error(`Campo desconocido en el catálogo ${CATALOG_VERSION}: ${id}`);
  return f;
}

export function maybeField(id: string): CompiledField | undefined {
  return FIELDS.get(id);
}

export function rule(fieldId: string): CompiledRule | undefined {
  return RULES.get(fieldId);
}

export function pack(id: string): CompiledPack {
  const p = PACKS.get(id);
  if (!p) throw new Error(`Paquete desconocido en el catálogo ${CATALOG_VERSION}: ${id}`);
  return p;
}

export const publicFields = (): CompiledField[] => CATALOG.fields.filter((f) => f.public);
export const filterableFields = (): CompiledField[] => CATALOG.fields.filter((f) => f.public && f.filterable);
