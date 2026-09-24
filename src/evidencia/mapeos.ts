// Vocabularios de las fuentes → valores del catálogo. Solo equivalencias inequívocas; lo dudoso
// no se mapea (queda para el texto y Jev).
import { plano } from "@/extraccion/texto";

export const TIPO_FEED: Record<string, string> = {
  apartment: "piso", flat: "piso", piso: "piso", apartamento: "piso",
  penthouse: "atico", atico: "atico",
  duplex: "duplex",
  villa: "chalet", chalet: "chalet", detached: "chalet",
  "town house": "adosado", townhouse: "adosado", "semi-detached": "adosado", adosado: "adosado", pareado: "adosado", bungalow: "adosado",
  house: "casa", "country house": "casa", finca: "casa", casa: "casa", cortijo: "casa",
  studio: "estudio", estudio: "estudio",
  commercial: "local", "commercial premises": "local", shop: "local", local: "local",
  office: "oficina", oficina: "oficina",
  plot: "terreno", land: "terreno", terreno: "terreno", solar: "terreno",
  garage: "garaje", "parking space": "garaje", garaje: "garaje",
};

export const OPERACION_FEED: Record<string, string> = { sale: "venta", month: "alquiler", week: "alquiler_vacacional", night: "alquiler_vacacional", venta: "venta", alquiler: "alquiler" };

/** Características del feed → (campo, valor). */
export const CARACTERISTICA_FEED: Array<[RegExp, string, unknown]> = [
  [/^(terrace|terraza|roof terrace|solarium)$/, "terraza", true],
  [/^(balcony|balcon)$/, "balcon", true],
  [/^(lift|elevator|ascensor)$/, "ascensor", true],
  [/^(air conditioning|a\/c|aire acondicionado|air con)$/, "aire_acondicionado", true],
  [/^(central heating|heating|calefaccion|underfloor heating)$/, "calefaccion", true],
  [/^(storage room|trastero|storage)$/, "trastero", true],
  [/^(furnished|amueblado)$/, "amueblado", true],
  [/^(wheelchair access|accesible|disabled access)$/, "accesible", true],
  [/^(private pool|piscina privada)$/, "piscina", "privada"],
  [/^(communal pool|shared pool|piscina comunitaria)$/, "piscina", "comunitaria"],
  [/^(sea views?|vistas al mar)$/, "vistas", "mar"],
  [/^(mountain views?|vistas a la montana)$/, "vistas", "montana"],
];

/** Etiquetas de una tabla de características (HTML) → campo. */
export const ETIQUETA_TABLA: Array<[RegExp, string]> = [
  [/^precio(\s+de\s+venta)?$|^price$/, "precio"],
  [/^(superficie\s+)?construida|^m2\s+construidos|^built(\s+area)?$|^superficie$/, "superficie_construida"],
  [/^(superficie\s+)?util|^usable/, "superficie_util"],
  [/^parcela|^plot/, "superficie_parcela"],
  [/^(habitaciones|dormitorios|bedrooms)$/, "habitaciones"],
  [/^(banos|bathrooms)$/, "banos"],
  [/^planta|^floor$/, "planta"],
  [/^(gastos\s+de\s+)?comunidad|^community/, "gastos_comunidad"],
  [/^ibi$/, "ibi"],
  [/^(certificado|calificacion)\s+energetic|^energy/, "certificado_energetico"],
  [/^referencia\s+catastral/, "referencia_catastral"],
  [/^ascensor$|^lift$/, "ascensor"],
  [/^terraza$|^terrace$/, "terraza"],
  [/^garaje$|^parking$/, "garaje"],
  [/^trastero$/, "trastero"],
  [/^piscina$|^pool$/, "piscina"],
];

export function campoDeEtiqueta(etiqueta: string): string | null {
  const e = plano(etiqueta).replace(/[:.]+$/, "").trim();
  for (const [re, campo] of ETIQUETA_TABLA) if (re.test(e)) return campo;
  return null;
}

/** «Sí/No/Yes/No/1/0» → booleano; null si no es una respuesta binaria. */
export function siNoTexto(v: string): boolean | null {
  const t = plano(v).trim();
  if (/^(si|yes|1|true|x|incluido|incluida)$/.test(t)) return true;
  if (/^(no|0|false|sin)$/.test(t)) return false;
  return null;
}
