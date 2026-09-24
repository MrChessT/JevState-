// Geocodificación a zona (municipio y barrio) y punto. Local y determinista: usa las coordenadas del
// feed si vienen, y si no, el texto de la dirección, el municipio y el código postal. Un geocodificador
// externo (CartoCiudad, IGN) puede enchufarse detrás de la misma interfaz (D-112).
import { distanciaMetros, type Punto } from "@/geo/distancia";
import { normalizarDireccion } from "@/extraccion/varios";
import { MUNICIPIOS } from "./datos";
import { buscarZonas, detectarZonas, ZONAS, type Zona } from "./buscar";

export interface EntradaGeo {
  direccion?: string | null;
  municipio?: string | null;
  codigoPostal?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export interface Geocodificacion {
  municipio: Zona;
  barrio: Zona | null;
  punto: Punto;
  precision: "coordenadas" | "barrio" | "municipio";
  /** 0-1: seguridad de la zona asignada. */
  confianza: number;
  motivo: string;
}

export interface GeocoderPort {
  geocodificar(entrada: EntradaGeo): Promise<Geocodificacion | null>;
}

const MUNICIPIO = new Map(ZONAS.filter((z) => z.nivel === "municipio").map((z) => [z.municipio, z]));

/** Municipio por código postal: el prefijo más largo que coincida. */
export function municipioPorCp(cp: string | null | undefined): Zona | null {
  if (!cp || !/^\d{5}$/.test(cp)) return null;
  let mejor: { slug: string; largo: number } | null = null;
  for (const m of MUNICIPIOS) for (const p of m.cp) if (cp.startsWith(p) && (!mejor || p.length > mejor.largo)) mejor = { slug: m.slug, largo: p.length };
  return mejor ? MUNICIPIO.get(mejor.slug) ?? null : null;
}

function barrioMasCercano(municipio: string, p: Punto, maxMetros = 2500): Zona | null {
  let mejor: { z: Zona; d: number } | null = null;
  for (const z of ZONAS) {
    if (z.nivel !== "barrio" || z.municipio !== municipio) continue;
    const d = distanciaMetros(p, z);
    if (d <= maxMetros && (!mejor || d < mejor.d)) mejor = { z, d };
  }
  return mejor?.z ?? null;
}

export class GeocoderLocal implements GeocoderPort {
  async geocodificar(e: EntradaGeo): Promise<Geocodificacion | null> {
    const dir = e.direccion ? normalizarDireccion(e.direccion) : null;
    const cp = e.codigoPostal ?? dir?.codigoPostal ?? null;
    // 1. Municipio: por su nombre, por el código postal o por la dirección.
    let municipio: Zona | null = null;
    let conf = 0;
    let motivo = "";
    if (e.municipio) {
      const c = buscarZonas(e.municipio, { nivel: "municipio", minimo: 0.8, limite: 1 })[0];
      if (c) {
        municipio = c.zona;
        conf = c.literal ? 0.98 : 0.85;
        motivo = c.literal ? "municipio del feed" : `municipio del feed con errata («${e.municipio}»)`;
      }
    }
    const porCp = municipioPorCp(cp);
    if (porCp && municipio && porCp.municipio !== municipio.municipio) {
      conf = Math.min(conf, 0.6);
      motivo += `; el código postal ${cp} apunta a ${porCp.nombre}`;
    } else if (porCp && !municipio) {
      municipio = porCp;
      conf = 0.8;
      motivo = `código postal ${cp}`;
    }
    const menciones = dir ? detectarZonas(`${dir.resto} ${e.direccion}`) : [];
    if (!municipio) {
      const m = menciones.flatMap((x) => x.candidatas).find((c) => c.zona.nivel === "municipio");
      if (m) {
        municipio = MUNICIPIO.get(m.zona.municipio)!;
        conf = 0.75;
        motivo = "municipio en la dirección";
      }
    }
    // 2. Solo coordenadas: municipio más cercano (orientativo).
    const coords = e.lat != null && e.lon != null && Number.isFinite(e.lat) && Number.isFinite(e.lon) ? { lat: e.lat, lon: e.lon } : null;
    if (!municipio && coords) {
      let mejor: { z: Zona; d: number } | null = null;
      for (const z of MUNICIPIO.values()) {
        const d = distanciaMetros(coords, z);
        if (!mejor || d < mejor.d) mejor = { z, d };
      }
      if (mejor && mejor.d < 15_000) {
        municipio = mejor.z;
        conf = 0.55;
        motivo = "municipio más cercano a las coordenadas";
      }
    }
    if (!municipio) return null;
    // 3. Barrio: nombrado en la dirección, o el más cercano a las coordenadas.
    let barrio: Zona | null = null;
    const nombrado = menciones.flatMap((x) => x.candidatas).find((c) => c.zona.nivel === "barrio" && c.zona.municipio === municipio!.municipio && c.score >= 0.85);
    if (nombrado) barrio = nombrado.zona;
    else if (coords) barrio = barrioMasCercano(municipio.municipio, coords);
    const punto = coords ?? (barrio ? { lat: barrio.lat, lon: barrio.lon } : { lat: municipio.lat, lon: municipio.lon });
    return {
      municipio,
      barrio,
      punto,
      precision: coords ? "coordenadas" : barrio ? "barrio" : "municipio",
      confianza: conf,
      motivo: `${motivo}${barrio ? `; barrio ${nombrado ? "nombrado en la dirección" : "más cercano"}` : ""}`,
    };
  }
}
