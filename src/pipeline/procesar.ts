// Pipeline por inmueble: registro → evidencias → geocodificación → cascada SDE → canónico → guardado.
// Se ejecuta SIEMPRE en segundo plano (worker), nunca en una petición de usuario.
import type { CompiledCatalog } from "@/catalog/schema";
import { construirEvidencias } from "@/evidencia/index";
import { evidencia, type Evidencia } from "@/evidencia/tipos";
import { ubicacionAproximada } from "@/geo/distancia";
import type { RegistroFuente } from "@/ingesta/tipos";
import type { JevPort } from "@/jev/port";
import type { IndicePoi } from "@/poi/indice";
import type { CanonicoInmueble } from "@/sde/cascada/canonico";
import { enriquecer, type ResultadoCascada } from "@/sde/cascada/ejecutar";
import type { limitador } from "@/sde/cascada/concurrencia";
import type { GeocoderPort } from "@/zonas/geocodificar";
import type { AlmacenInmuebles, PayloadGuardado } from "./almacen";

export interface DepsPipeline {
  jev: JevPort;
  catalog: CompiledCatalog;
  geocoder: GeocoderPort;
  almacen: AlmacenInmuebles;
  agencyId: string;
  pois?: IndicePoi;
  modo?: "normal" | "sin_jev";
  /** Reprocesar aunque el contenido no haya cambiado (p. ej. nueva versión del catálogo). */
  forzar?: boolean;
  limitadores?: Map<string, ReturnType<typeof limitador>>;
  reintentos?: Parameters<typeof enriquecer>[1]["reintentos"];
  ahora?: () => Date;
}

export interface ResultadoProcesado {
  ref: string;
  omitido: boolean;
  listingId?: string;
  canonicalVersion?: number;
  cambio?: boolean;
  estado?: string;
  cascada?: ResultadoCascada;
  evidencias?: Evidencia[];
}

const TIPO_SLUG: Record<string, string> = { piso: "piso", atico: "atico", duplex: "duplex", casa: "casa", chalet: "chalet", adosado: "adosado", estudio: "estudio", local: "local", oficina: "oficina", terreno: "terreno", garaje: "garaje" };

/** «piso-3-hab-ref-1234» (URL limpia de la sección 2.1). */
export function slugInmueble(c: CanonicoInmueble, ref: string): string {
  const tipo = TIPO_SLUG[String(c.campos.tipo?.value ?? "")] ?? "inmueble";
  const hab = c.campos.habitaciones?.value;
  const r = ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [tipo, typeof hab === "number" ? `${hab}-hab` : null, "ref", r].filter(Boolean).join("-");
}

const valor = (c: CanonicoInmueble, id: string) => {
  const f = c.campos[id];
  return f && f.value !== null ? f.value : null;
};

/** Se publica solo si todos los campos obligatorios tienen valor fiable. */
export function publicable(c: CanonicoInmueble, catalog: CompiledCatalog): { ok: boolean; faltan: string[] } {
  const faltan = catalog.fields.filter((f) => f.requiredForPublish).filter((f) => !["confirmado", "probable"].includes(c.campos[f.id]?.status ?? "")).map((f) => f.id);
  return { ok: faltan.length === 0, faltan };
}

export async function procesarRegistro(r: RegistroFuente, hash: string, d: DepsPipeline): Promise<ResultadoProcesado> {
  const ctx = await d.almacen.contexto(d.agencyId, r.fuente, r.sourceId);
  if (!d.forzar && ctx.contentHash === hash) return { ref: r.ref, omitido: true, listingId: ctx.listingId };

  const evidencias = construirEvidencias(r);
  const c = r.campos;
  const geo = await d.geocoder.geocodificar({
    direccion: c.address ?? c.direccion ?? c.location_detail ?? null,
    municipio: c.town ?? c.municipio ?? null,
    codigoPostal: c.postcode ?? c.codigo_postal ?? null,
    lat: r.coordenadas?.lat ?? null,
    lon: r.coordenadas?.lon ?? null,
  });
  if (geo) {
    const path = geo.barrio?.path ?? geo.municipio.path;
    evidencias.push(evidencia({ listingKey: r.ref, source: "geocode", path: "geocode", raw: geo.motivo, campo: "zona", parsed: { valor: path, confianza: geo.confianza, precision: geo.precision }, capturedAt: r.capturadoEn }));
  }

  const descripcion = r.descripcion.es ?? Object.values(r.descripcion)[0] ?? "";
  const cascada = await enriquecer(
    { ref: r.ref, evidencias, descripcion, titulo: r.titulo.es, capturadoEn: r.capturadoEn },
    { jev: d.jev, catalog: d.catalog, modo: d.modo, manuales: ctx.manuales, limitadores: d.limitadores, reintentos: d.reintentos, ahora: d.ahora },
  );
  const canon = cascada.canonico;
  const pub = publicable(canon, d.catalog);
  const operacion = valor(canon, "operacion") as string | null;
  const publico = geo ? ubicacionAproximada(geo.punto, `${d.agencyId}:${r.ref}`) : null;
  const esPublico = new Map(d.catalog.fields.map((f) => [f.id, f.public]));
  const todasEvidencias = [...evidencias, ...cascada.evidenciasNuevas];

  const payload: PayloadGuardado = {
    agency_id: d.agencyId,
    listing: {
      ref: r.ref,
      slug: slugInmueble(canon, r.ref),
      status: pub.ok ? "publicado" : "borrador",
      operation: operacion ?? "venta",
      zone_path: geo ? (geo.barrio?.path ?? geo.municipio.path) : null,
      ...(publico ? { lat: publico.lat, lon: publico.lon } : {}),
      canonical: canon,
      catalog_version: canon.catalogVersion,
      price: valor(canon, "precio"),
      currency: "EUR",
      area_m2: valor(canon, "superficie_construida") ?? valor(canon, "superficie_util"),
      bedrooms: valor(canon, "habitaciones"),
      bathrooms: valor(canon, "banos"),
      property_type: valor(canon, "tipo"),
      source: r.fuente,
      source_id: r.sourceId,
      content_hash: hash,
      is_fictitious: r.ficticio,
    },
    private: {
      address_exact: c.address ?? c.direccion ?? null,
      cadastral_ref: valor(canon, "referencia_catastral"),
      ...(r.coordenadas ? { lat: r.coordenadas.lat, lon: r.coordenadas.lon } : {}),
    },
    evidence: todasEvidencias,
    fields: Object.entries(canon.campos).map(([id, f]) => ({
      field_id: id,
      value: f.value,
      confidence: f.confidence,
      status: f.status,
      method: f.method,
      evidence_ids: f.evidenceIds,
      catalog_version: f.catalogVersion,
      is_public: esPublico.get(id) ?? false,
      adjudication: f.adjudicacion ?? null,
    })),
    reviews: [
      ...cascada.revisiones.map((x) => ({ field_id: x.campo, reason: x.motivo, proposed: x.propuesto, confidence: x.confianza, evidence_ids: x.evidenceIds, catalog_version: canon.catalogVersion })),
      ...pub.faltan.filter((f) => !cascada.revisiones.some((x) => x.campo === f)).map((f) => ({ field_id: f, reason: "campo_dudoso", proposed: null, confidence: 0, evidence_ids: [], catalog_version: canon.catalogVersion })),
    ],
    decisions: cascada.decisiones,
    translations: Object.entries(r.descripcion).map(([locale, description]) => ({ locale, title: r.titulo[locale as keyof typeof r.titulo] ?? r.ref, description, machine_translated: false })),
    media: r.imagenes.map((im, i) => ({ url: im.url, position: i })),
    ...(d.pois && geo ? { poi_distances: d.pois.distancias(geo.punto) } : {}),
  };
  const g = await d.almacen.guardar(payload);
  return { ref: r.ref, omitido: false, listingId: g.listingId, canonicalVersion: g.canonicalVersion, cambio: g.cambio, estado: payload.listing.status as string, cascada, evidencias: todasEvidencias };
}
