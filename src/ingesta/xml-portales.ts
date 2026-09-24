// Adaptador del feed XML estándar de portales (formato Kyero v3, habitual en España), con las
// etiquetas extra que suelen añadir los CRM (address, postcode, floor, community_fees, ibi, title).
// El adaptador no interpreta: aplana el XML a pares ruta → literal. La interpretación es de las
// evidencias y de la cascada.
import { XMLParser } from "fast-xml-parser";
import type { AdaptadorFuente, RegistroFuente } from "./tipos";

type Nodo = string | number | boolean | null | undefined | Nodo[] | { [k: string]: Nodo };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false, // todo como texto: los números los normaliza el código
  trimValues: true,
  isArray: (nombre) => ["property", "feature", "image"].includes(nombre),
});

/** Aplana un nodo a rutas «a/b», con índice en listas «features/feature[2]». */
export function aplanar(nodo: Nodo, prefijo = "", out: Record<string, string> = {}): Record<string, string> {
  if (nodo === null || nodo === undefined) return out;
  if (Array.isArray(nodo)) {
    nodo.forEach((n, i) => aplanar(n, `${prefijo}[${i}]`, out));
    return out;
  }
  if (typeof nodo === "object") {
    for (const [k, v] of Object.entries(nodo)) {
      if (k === "#text") aplanar(v, prefijo, out);
      else aplanar(v, prefijo ? `${prefijo}/${k}` : k, out);
    }
    return out;
  }
  const texto = String(nodo).trim();
  if (texto) out[prefijo] = texto;
  return out;
}

const EXCLUIR = /^(desc|title|images|url)(\/|\[|$)/;

export function parsearFeedXml(xml: string, opciones: { adaptador: string; capturadoEn?: string; ficticio?: boolean }): RegistroFuente[] {
  const doc = parser.parse(xml) as { root?: { property?: Array<Record<string, Nodo>> } };
  const propiedades = doc.root?.property ?? [];
  const capturadoEn = opciones.capturadoEn ?? new Date().toISOString();
  return propiedades.map((p) => {
    const plano = aplanar(p as Nodo);
    const campos = Object.fromEntries(Object.entries(plano).filter(([k]) => !EXCLUIR.test(k)));
    const textos = (raiz: string) => Object.fromEntries(Object.entries(plano).filter(([k]) => k.startsWith(`${raiz}/`)).map(([k, v]) => [k.slice(raiz.length + 1), v]));
    const lat = Number(plano["location/latitude"]);
    const lon = Number(plano["location/longitude"]);
    const imagenes = Object.entries(plano)
      .filter(([k]) => /^images\/image\[\d+\]\/url$/.test(k))
      .map(([, url]) => ({ url }));
    return {
      fuente: "feed" as const,
      adaptador: opciones.adaptador,
      sourceId: plano.id ?? plano.ref ?? "",
      ref: (plano.ref ?? plano.id ?? "").replace(/[^A-Za-z0-9-]/g, "-").slice(0, 32),
      campos,
      titulo: textos("title"),
      descripcion: textos("desc"),
      imagenes,
      ...(Number.isFinite(lat) && Number.isFinite(lon) && plano["location/latitude"] ? { coordenadas: { lat, lon } } : {}),
      capturadoEn,
      ficticio: opciones.ficticio ?? false,
    };
  });
}

export class AdaptadorXmlPortales implements AdaptadorFuente {
  constructor(
    readonly codigo: string,
    private readonly cargar: () => Promise<string>,
    readonly legalOk: boolean,
    readonly baseLegal: string,
    private readonly opciones: { ficticio?: boolean; paginas?: (ref: string) => Promise<string | undefined> } = {},
  ) {}

  async *leer(): AsyncIterable<RegistroFuente> {
    const registros = parsearFeedXml(await this.cargar(), { adaptador: this.codigo, ficticio: this.opciones.ficticio });
    for (const r of registros) {
      const html = await this.opciones.paginas?.(r.ref);
      yield html ? { ...r, html } : r;
    }
  }
}
