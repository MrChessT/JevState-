// Evidencias de una página HTML: JSON-LD (schema.org), metadatos, tabla de características y texto
// visible. Solo para fuentes con permiso (web propia o fuente autorizada).
import { parse, type HTMLElement } from "node-html-parser";
import Decimal from "decimal.js";
import { parseCifra } from "@/extraccion/numeros";
import { evidenciasDeFeed } from "./desde-feed";
import { evidenciasDeTexto } from "./desde-texto";
import { campoDeEtiqueta } from "./mapeos";
import { evidencia, type Evidencia } from "./tipos";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function num(v: Json | undefined): Decimal | null {
  if (typeof v === "number") return Number.isFinite(v) ? new Decimal(v) : null;
  if (typeof v === "string") {
    const c = parseCifra(v.replace(/[€\s]|eur|m2|m²/gi, ""));
    return c && !c.alternativa ? c.valor : null;
  }
  return null;
}

/** Busca recursivamente objetos schema.org con precio, superficie o estancias. */
function recorrer(nodo: Json, ruta: string, visita: (obj: Record<string, Json>, ruta: string) => void) {
  if (Array.isArray(nodo)) nodo.forEach((n, i) => recorrer(n, `${ruta}[${i}]`, visita));
  else if (nodo && typeof nodo === "object") {
    visita(nodo, ruta);
    for (const [k, v] of Object.entries(nodo)) if (v && typeof v === "object") recorrer(v, `${ruta}.${k}`, visita);
  }
}

export function evidenciasDeJsonLd(root: HTMLElement, listingKey: string, capturedAt: string): Evidencia[] {
  const out: Evidencia[] = [];
  root.querySelectorAll('script[type="application/ld+json"]').forEach((s, i) => {
    let data: Json;
    try {
      data = JSON.parse(s.text) as Json;
    } catch {
      return;
    }
    recorrer(data, `jsonld[${i}]`, (obj, ruta) => {
      const add = (clave: string, campo: string, parsed: Record<string, unknown>) =>
        out.push(evidencia({ listingKey, source: "jsonld", path: `${ruta}.${clave}`, raw: JSON.stringify(obj[clave]), campo, parsed, capturedAt }));
      if (obj.price !== undefined) {
        const v = num(obj.price);
        if (v && v.gt(0)) add("price", "precio", { valor: v.toString(), unidad: typeof obj.priceCurrency === "string" ? obj.priceCurrency : "EUR", contexto: "precio" });
      }
      const floor = obj.floorSize;
      if (floor && typeof floor === "object" && !Array.isArray(floor)) {
        const v = num(floor.value);
        if (v && v.gt(0)) add("floorSize", "superficie_construida", { valor: v.toString(), unidad: "m2" });
      }
      for (const [clave, campo] of [["numberOfBedrooms", "habitaciones"], ["numberOfRooms", "habitaciones"], ["numberOfBathroomsTotal", "banos"]] as const) {
        const v = num(obj[clave]);
        if (v && v.isInteger() && v.gte(0)) add(clave, campo, { valor: v.toString(), unidad: "" });
      }
    });
  });
  return out;
}

export function evidenciasDeMeta(root: HTMLElement, listingKey: string, capturedAt: string): Evidencia[] {
  const out: Evidencia[] = [];
  for (const m of root.querySelectorAll("meta")) {
    const nombre = m.getAttribute("property") ?? m.getAttribute("name") ?? "";
    const contenido = m.getAttribute("content") ?? "";
    if (!contenido) continue;
    if (/^(og|product):price:amount$/.test(nombre)) {
      const v = num(contenido);
      if (v && v.gt(0)) out.push(evidencia({ listingKey, source: "meta", path: `meta[${nombre}]`, raw: contenido, campo: "precio", parsed: { valor: v.toString(), unidad: "EUR", contexto: "precio" }, capturedAt }));
    } else if (/^(og:description|description|twitter:description)$/.test(nombre)) {
      out.push(...evidenciasDeTexto(contenido, { listingKey, source: "meta", pathBase: `meta[${nombre}]`, capturedAt }));
    }
  }
  return out;
}

export function evidenciasDeTabla(root: HTMLElement, listingKey: string, capturedAt: string): Evidencia[] {
  const pares: Array<[string, string, string]> = [];
  root.querySelectorAll("dl").forEach((dl, i) => {
    const dts = dl.querySelectorAll("dt");
    dts.forEach((dt, j) => {
      const dd = dt.nextElementSibling;
      if (dd?.tagName === "DD") pares.push([dt.text.trim(), dd.text.trim(), `dl[${i}]/dt[${j}]`]);
    });
  });
  root.querySelectorAll("tr").forEach((tr, i) => {
    const celdas = tr.querySelectorAll("th, td");
    if (celdas.length === 2) pares.push([celdas[0]!.text.trim(), celdas[1]!.text.trim(), `tr[${i}]`]);
  });
  root.querySelectorAll("li").forEach((li, i) => {
    const m = /^([^:]{2,40}):\s*(.+)$/.exec(li.text.trim());
    if (m) pares.push([m[1]!, m[2]!, `li[${i}]`]);
  });
  // Se reutiliza la interpretación del feed: una tabla es un conjunto de pares etiqueta → valor.
  const campos: Record<string, string> = {};
  const rutas: Record<string, string> = {};
  for (const [etiqueta, valor, ruta] of pares) {
    const campo = campoDeEtiqueta(etiqueta);
    if (!campo || campos[campo] !== undefined) continue;
    campos[campo] = valor;
    rutas[campo] = ruta;
  }
  const comoFeed = evidenciasDeFeed({ fuente: "feed", adaptador: "tabla", sourceId: listingKey, ref: listingKey, campos, titulo: {}, descripcion: {}, imagenes: [], capturadoEn: capturedAt, ficticio: false });
  return comoFeed.map((e) => evidencia({ ...e, source: "features_table", path: rutas[e.path] ?? e.path }));
}

export function textoVisible(root: HTMLElement): string {
  const copia = parse(root.toString());
  copia.querySelectorAll("script, style, noscript, nav, header, footer, dl, table").forEach((n) => n.remove());
  return copia.text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export function evidenciasDeHtml(html: string, listingKey: string, capturedAt: string): Evidencia[] {
  const root = parse(html);
  return [
    ...evidenciasDeJsonLd(root, listingKey, capturedAt),
    ...evidenciasDeMeta(root, listingKey, capturedAt),
    ...evidenciasDeTabla(root, listingKey, capturedAt),
    ...evidenciasDeTexto(textoVisible(root), { listingKey, source: "visible_text", pathBase: "body", capturedAt }),
  ];
}
