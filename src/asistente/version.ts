import { stableHash } from "@/jev/stable";
import { contenidoCatalogo } from "./catalogo";
import registro from "./catalogo.version.json";

/** Versión del catálogo de preguntas del asistente. La actualiza `npm run catalog:compile`. */
export const ASSISTANT_CATALOG_VERSION: string = registro.version;
export const ASSISTANT_CATALOG_HASH: string = registro.hash;

export function hashActual(): string {
  return stableHash(contenidoCatalogo());
}
