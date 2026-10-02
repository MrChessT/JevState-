import { NOMBRE_VISIBLE } from "@/config/brand";

/** Google corta los títulos hacia los 60 caracteres: la marca solo se añade si cabe. */
export const MAX_TITULO = 60;

export function conMarca(titulo: string): string {
  const completo = `${titulo} · ${NOMBRE_VISIBLE}`;
  return completo.length <= MAX_TITULO ? completo : titulo;
}
