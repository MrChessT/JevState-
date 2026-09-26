// Repositorio del portal en memoria con los 300 FICTICIOS procesados por el pipeline real (con el Jev
// oráculo, para que la demo muestre el comportamiento esperado). Solo desarrollo, e2e y demos.
import { CATALOG } from "@/catalog/index";
import { feedXml, generarConjunto } from "@/ficticios/generador";
import { oraculo } from "@/ficticios/oraculo";
import { hashContenido } from "@/ingesta/tipos";
import { parsearFeedXml } from "@/ingesta/xml-portales";
import { FakeJev } from "@/jev/fake";
import { AlmacenMemoria } from "@/pipeline/almacen";
import { procesarRegistro } from "@/pipeline/procesar";
import type { CampoCanonico } from "@/sde/cascada/canonico";
import { zona } from "@/zonas/buscar";
import { GeocoderLocal } from "@/zonas/geocodificar";
import { buscarEnMemoria } from "./buscar-memoria";
import { estadisticaZona } from "./estadisticas";
import { esPositivo, RASGOS } from "./rasgos";
import type { RepositorioPortal } from "./repositorio";
import type { InmuebleFicha, InmuebleResumen } from "./tipos";

const TITULO: Record<string, string> = { piso: "Piso", atico: "Ático", duplex: "Dúplex", casa: "Casa", chalet: "Chalet", adosado: "Adosado", estudio: "Estudio", local: "Local", terreno: "Terreno", oficina: "Oficina", garaje: "Garaje" };

function num(c: CampoCanonico | undefined): number | null {
  return c && c.value !== null && c.status !== "no_consta" ? Number(c.value) : null;
}

/**
 * Genera las fichas ficticias pasando cada anuncio por el pipeline real (extracción, cascada con el
 * oráculo, adjudicación). Tarda ~1 s: el portal usa la versión precalculada (ficticios.json).
 */
export async function generarFichasFicticias(n = 300): Promise<InmuebleFicha[]> {
  const inmuebles = generarConjunto(n);
  const verdades = new Map(inmuebles.map((i) => [i.ref, i.verdad]));
  const paginas = new Map(inmuebles.filter((i) => i.html).map((i) => [i.ref, i.html!]));
  const jev = new FakeJev({ responder: oraculo(verdades, CATALOG) });
  const almacen = new AlmacenMemoria();
  const registros = parsearFeedXml(feedXml(inmuebles), { adaptador: "ficticios", capturadoEn: "2026-09-01T00:00:00Z", ficticio: true });
  const fichas: InmuebleFicha[] = [];
  for (const [k, r0] of registros.entries()) {
    const r = paginas.has(r0.ref) ? { ...r0, html: paginas.get(r0.ref)! } : r0;
    const res = await procesarRegistro(r, hashContenido(r), { jev, catalog: CATALOG, geocoder: new GeocoderLocal(), almacen, agencyId: "demo", limitadores: new Map() });
    if (res.estado !== "publicado") continue;
    const g = [...almacen.guardados.values()].find((x) => x.payload.listing.ref === r.ref)!.payload;
    const campos = res.cascada!.canonico.campos;
    const z = zona(String(g.listing.zone_path ?? ""));
    const tipo = (campos.tipo?.value as string | null) ?? null;
    const hab = num(campos.habitaciones);
    fichas.push({
      id: `demo-${r.ref}`,
      ref: r.ref,
      slug: String(g.listing.slug),
      operacion: g.listing.operation as InmuebleFicha["operacion"],
      tipo,
      titulo: `${TITULO[tipo ?? ""] ?? "Inmueble"}${hab ? ` de ${hab} hab.` : ""} en ${z?.nombre ?? ""}`,
      zonaPath: z?.path ?? "",
      zonaNombre: z?.nombre ?? "",
      municipioNombre: z?.nombreMunicipio ?? "",
      precio: num(campos.precio),
      precioAnterior: num(campos.precio_anterior),
      superficie: num(campos.superficie_construida) ?? num(campos.superficie_util),
      habitaciones: hab,
      banos: num(campos.banos),
      plantaTipo: (campos.planta_tipo?.value as string | null) ?? null,
      lat: (g.listing.lat as number | undefined) ?? null,
      lon: (g.listing.lon as number | undefined) ?? null,
      foto: `/ficticios/foto/${r.ref}`,
      rasgos: RASGOS.filter((c) => campos[c] && campos[c].status !== "no_consta" && esPositivo(c, campos[c].value)).map((c) => ({ campo: c, status: campos[c]!.status })),
      // Fechas escalonadas deterministas para ordenar por «recientes».
      publicadoEn: new Date(Date.UTC(2026, 8, 1) - k * 3_600_000 * 7).toISOString(),
      ficticio: true,
      descripcion: r.descripcion.es ?? "",
      descripcionTraducida: false,
      campos,
      fotos: [1, 2, 3].map((i) => `/ficticios/foto/${r.ref}?n=${i}`),
      distancias: [],
      agente: { nombre: "Equipo comercial", telefono: null, email: null },
    });
  }
  return fichas.map(compactar);
}

/** Solo lo que usa la web: el detalle interno del pipeline (adjudicación, notas) no viaja. */
function compactar(f: InmuebleFicha): InmuebleFicha {
  const campos = Object.fromEntries(
    // Lo que no consta no se guarda: la interfaz trata un campo ausente como «no consta».
    Object.entries(f.campos).filter(([, c]) => c.status !== "no_consta" && c.value !== null).map(([k, c]) => [k, { value: c.value, confidence: Math.round(c.confidence * 1000) / 1000, status: c.status, evidenceIds: c.evidenceIds.slice(0, 1), method: c.method, catalogVersion: c.catalogVersion }]),
  );
  return { ...f, campos };
}

/** Repositorio de ficticios: precalculado (instantáneo) para 300; generado al vuelo para otros tamaños (tests). */
export async function construirRepoFicticio(n = 300): Promise<RepositorioPortal> {
  const fichas = n === 300 ? ((await import("./ficticios.json")).default as unknown as InmuebleFicha[]) : await generarFichasFicticias(n);
  return repoDesdeFichas(fichas);
}

export function repoDesdeFichas(fichas: InmuebleFicha[]): RepositorioPortal {
  const resumenes: InmuebleResumen[] = fichas;
  return {
    async buscar(f) {
      return buscarEnMemoria(resumenes, f);
    },
    async ficha(operacion, slug) {
      return fichas.find((x) => x.slug === slug && (x.operacion === operacion || (operacion === "alquiler" && x.operacion === "alquiler_vacacional"))) ?? null;
    },
    async similares(i, n = 4) {
      return resumenes
        .filter((x) => x.ref !== i.ref && x.operacion === i.operacion && x.zonaPath.split("/")[0] === i.zonaPath.split("/")[0])
        .sort((a, b) => Math.abs((a.precio ?? 0) - (i.precio ?? 0)) - Math.abs((b.precio ?? 0) - (i.precio ?? 0)))
        .slice(0, n);
    },
    async destacados(n = 6) {
      return [...resumenes].filter((x) => x.operacion === "venta").sort((a, b) => b.publicadoEn.localeCompare(a.publicadoEn)).slice(0, n);
    },
    async estadistica(path, operacion) {
      return estadisticaZona(path, resumenes, operacion);
    },
    async todas() {
      return resumenes;
    },
    async porRefs(refs) {
      return refs.map((r) => resumenes.find((x) => x.ref === r)).filter((x): x is InmuebleResumen => Boolean(x));
    },
    async fichasPorRef(refs) {
      return refs.slice(0, 3).map((r) => fichas.find((x) => x.ref === r)).filter((x): x is InmuebleFicha => Boolean(x));
    },
  };
}
