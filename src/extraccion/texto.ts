/** Minúsculas, sin tildes (salvo ñ) y espacios simples. Conserva la longitud de cada carácter. */
export function plano(texto: string): string {
  return texto
    .replace(/ñ/g, "\u0000")
    .replace(/Ñ/g, "\u0001")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0000/g, "ñ")
    .replace(/\u0001/g, "ñ")
    .toLowerCase();
}

/** Normaliza para comparar: plano, sin signos y con espacios simples. */
export function clave(texto: string): string {
  return plano(texto).replace(/[^a-z0-9ñ]+/g, " ").trim();
}

export interface Tramo {
  /** Texto literal tal como aparece en la fuente. */
  literal: string;
  inicio: number;
  fin: number;
}

/** Ventana de texto antes de una posición (para detectar contexto: «comunidad», «antes»…). */
export function antes(texto: string, inicio: number, caracteres = 40): string {
  return plano(texto.slice(Math.max(0, inicio - caracteres), inicio));
}

export function despues(texto: string, fin: number, caracteres = 30): string {
  return plano(texto.slice(fin, fin + caracteres));
}
