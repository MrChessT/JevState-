// Importación CSV (sección 3.1): una fila por inmueble, cabeceras con los ids del catálogo más
// ref, municipio, direccion, codigo_postal, lat, lon, titulo_<idioma>, descripcion_<idioma>.
import { parseCsv } from "@/catalog/csv";
import type { AdaptadorFuente, RegistroFuente } from "./tipos";

export function parsearCsvInmuebles(texto: string, opciones: { adaptador: string; capturadoEn?: string; ficticio?: boolean }): RegistroFuente[] {
  const [cabecera, ...filas] = parseCsv(texto);
  if (!cabecera) return [];
  const cols = cabecera.map((c) => c.trim().toLowerCase());
  if (!cols.includes("ref")) throw new Error("El CSV necesita una columna «ref»");
  const capturadoEn = opciones.capturadoEn ?? new Date().toISOString();
  return filas.map((fila) => {
    const f = Object.fromEntries(cols.map((c, i) => [c, (fila[i] ?? "").trim()]));
    const campos: Record<string, string> = {};
    const titulo: Record<string, string> = {};
    const descripcion: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) {
      if (!v) continue;
      const t = /^titulo_([a-z]{2})$/.exec(k);
      const d = /^descripcion_([a-z]{2})$/.exec(k);
      if (t) titulo[t[1]!] = v;
      else if (d) descripcion[d[1]!] = v;
      else if (k !== "lat" && k !== "lon") campos[k] = v;
    }
    const lat = Number(f.lat);
    const lon = Number(f.lon);
    return {
      fuente: "csv" as const,
      adaptador: opciones.adaptador,
      sourceId: f.ref!,
      ref: f.ref!,
      campos,
      titulo,
      descripcion,
      imagenes: [],
      ...(f.lat && f.lon && Number.isFinite(lat) && Number.isFinite(lon) ? { coordenadas: { lat, lon } } : {}),
      capturadoEn,
      ficticio: opciones.ficticio ?? false,
    };
  });
}

export class AdaptadorCsv implements AdaptadorFuente {
  constructor(
    readonly codigo: string,
    private readonly cargar: () => Promise<string>,
    readonly legalOk: boolean,
    readonly baseLegal: string,
  ) {}

  async *leer(): AsyncIterable<RegistroFuente> {
    for (const r of parsearCsvInmuebles(await this.cargar(), { adaptador: this.codigo })) yield r;
  }
}
