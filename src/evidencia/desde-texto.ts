// Evidencias del texto libre (descripción, texto visible, meta). Son candidatas: nunca se aceptan
// sin Jev (etapa verify o reasoning). El literal incluye la frase alrededor para que Jev tenga contexto.
import type { Source } from "@/catalog/schema";
import { extraerMenciones, type Rasgo } from "@/extraccion/caracteristicas";
import { extraerBanos, extraerDormitorios } from "@/extraccion/estancias";
import { aAnual, aMensual, extraerImportes } from "@/extraccion/importes";
import { extraerPlanta } from "@/extraccion/planta";
import { extraerSuperficies } from "@/extraccion/superficies";
import { extraerCertificado, extraerReferenciaCatastral } from "@/extraccion/varios";
import { evidencia, type Evidencia } from "./tipos";

/** La frase que contiene [inicio, fin), recortada a ~160 caracteres. */
export function frase(texto: string, inicio: number, fin: number): string {
  const antes = texto.slice(0, inicio);
  const a = Math.max(antes.lastIndexOf(". "), antes.lastIndexOf("\n"), antes.lastIndexOf("! "), antes.lastIndexOf("? ")) + 1;
  const tras = texto.slice(fin).search(/[.!?\n]/);
  const b = tras < 0 ? texto.length : fin + tras + 1;
  let s = texto.slice(a, b).trim();
  if (s.length > 160) {
    const centro = Math.round((inicio + fin) / 2) - a;
    s = `…${s.slice(Math.max(0, centro - 75), centro + 75).trim()}…`;
  }
  return s;
}

const RASGO_CAMPO: Partial<Record<Rasgo, { campo: string; valor: (negado: boolean) => unknown }>> = {
  terraza: { campo: "terraza", valor: (n) => !n },
  balcon: { campo: "balcon", valor: (n) => !n },
  trastero: { campo: "trastero", valor: (n) => !n },
  ascensor: { campo: "ascensor", valor: (n) => !n },
  aire_acondicionado: { campo: "aire_acondicionado", valor: (n) => !n },
  calefaccion: { campo: "calefaccion", valor: (n) => !n },
  amueblado: { campo: "amueblado", valor: (n) => !n },
  accesible: { campo: "accesible", valor: (n) => !n },
  okupado: { campo: "okupado", valor: (n) => !n },
  nuda_propiedad: { campo: "nuda_propiedad", valor: (n) => !n },
  subasta: { campo: "subasta", valor: (n) => !n },
  vpo: { campo: "vpo", valor: (n) => !n },
  alquilado: { campo: "alquilado_con_inquilino", valor: (n) => !n },
  licencia_turistica: { campo: "licencia_turistica", valor: (n) => !n },
  negociable: { campo: "negociable", valor: (n) => !n },
  garaje: { campo: "garaje", valor: (n) => (n ? "no_tiene" : "mencionado") },
  piscina: { campo: "piscina", valor: (n) => (n ? "no_tiene" : "mencionado") },
  exterior: { campo: "exterior", valor: () => "exterior" },
  vistas_mar: { campo: "vistas", valor: () => "mar" },
  reformado: { campo: "estado", valor: () => "reformado" },
  a_reformar: { campo: "estado", valor: () => "a_reformar" },
  luminoso: { campo: "luminosidad", valor: () => "luminoso" },
  tranquilo: { campo: "ruido", valor: () => "tranquilo" },
};

export function evidenciasDeTexto(texto: string, o: { listingKey: string; source: Source; pathBase: string; capturedAt: string }): Evidencia[] {
  if (!texto.trim()) return [];
  const out: Evidencia[] = [];
  const add = (inicio: number, fin: number, campo: string, parsed: Record<string, unknown>) =>
    out.push(evidencia({ listingKey: o.listingKey, source: o.source, path: `${o.pathBase}@${inicio}-${fin}`, raw: frase(texto, inicio, fin), campo, parsed: { ...parsed, literal: texto.slice(inicio, fin) }, capturedAt: o.capturedAt }));

  for (const i of extraerImportes(texto)) {
    const base = { valor: i.valor.toString(), unidad: "EUR", periodo: i.periodo, contexto: i.contexto, ...(i.alternativas.length ? { alternativas: i.alternativas.map(String) } : {}) };
    if (i.contexto === "precio" || (i.contexto === "desconocido" && i.conMoneda)) add(i.inicio, i.fin, "precio", base);
    else if (i.contexto === "precio_anterior") {
      add(i.inicio, i.fin, "precio_anterior", base);
      // Un precio anterior también es candidato a «precio» (por si el texto está desactualizado);
      // la adjudicación decide con el motivo precio_rebajado.
      add(i.inicio, i.fin, "precio", base);
    } else if (i.contexto === "comunidad") add(i.inicio, i.fin, "gastos_comunidad", { ...base, valor: aMensual(i.valor, i.periodo).toString(), unidad: "EUR/mes" });
    else if (i.contexto === "ibi") add(i.inicio, i.fin, "ibi", { ...base, valor: aAnual(i.valor, i.periodo === "unico" ? "año" : i.periodo).toString(), unidad: "EUR/año" });
  }
  for (const s of extraerSuperficies(texto)) {
    const campo = s.tipo === "util" ? "superficie_util" : s.tipo === "parcela" ? "superficie_parcela" : s.tipo === "terraza" ? null : "superficie_construida";
    if (campo) add(s.inicio, s.fin, campo, { valor: s.m2.toString(), unidad: "m2", tipo: s.tipo });
  }
  for (const d of extraerDormitorios(texto)) add(d.inicio, d.fin, "habitaciones", { valor: String(d.n), unidad: "" });
  for (const b of extraerBanos(texto)) add(b.inicio, b.fin, "banos", { valor: String(b.n), unidad: "" });
  for (const p of extraerPlanta(texto)) {
    if (p.numero !== null) add(p.inicio, p.fin, "planta", { valor: String(p.numero), unidad: "" });
    add(p.inicio, p.fin, "planta_tipo", { valor: p.tipo });
  }
  for (const c of extraerCertificado(texto)) add(c.inicio, c.fin, "certificado_energetico", { valor: c.valor });
  for (const r of extraerReferenciaCatastral(texto)) add(r.inicio, r.fin, "referencia_catastral", { valor: r.valor });
  for (const m of extraerMenciones(texto)) {
    const map = RASGO_CAMPO[m.rasgo];
    if (map) add(m.inicio, m.fin, map.campo, { valor: map.valor(m.negado), mencion: true, negado: m.negado });
  }
  return out;
}
