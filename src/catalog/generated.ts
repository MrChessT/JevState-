// ARCHIVO GENERADO por `npm run catalog:compile`. No editar a mano.
// Catálogo 2026-09-24.c9aa22b3

export const CATALOG_VERSION = "2026-09-24.c9aa22b3";

export type FieldId = "operacion" | "tipo" | "precio" | "superficie_construida" | "superficie_util" | "superficie_parcela" | "habitaciones" | "banos" | "planta" | "planta_tipo" | "zona" | "direccion" | "referencia_catastral" | "gastos_comunidad" | "ibi" | "precio_anterior" | "negociable" | "alquilado_con_inquilino" | "rentabilidad_declarada" | "terraza" | "balcon" | "garaje" | "trastero" | "ascensor" | "piscina" | "aire_acondicionado" | "calefaccion" | "orientacion" | "exterior" | "estado" | "luminosidad" | "ruido" | "calidad_acabados" | "vistas" | "accesible" | "amueblado" | "vpo" | "okupado" | "nuda_propiedad" | "subasta" | "cargas_mencionadas" | "certificado_energetico" | "licencia_turistica";

export type PackId = "core" | "financiero" | "fisico" | "legal" | "vacacional";

/** Valores de los campos enum y ordinal. */
export interface EnumValues {
  operacion: "venta" | "alquiler" | "alquiler_vacacional";
  tipo: "piso" | "atico" | "duplex" | "casa" | "chalet" | "adosado" | "estudio" | "local" | "oficina" | "terreno" | "garaje";
  planta_tipo: "sotano" | "bajo" | "entresuelo" | "intermedia" | "ultima" | "atico";
  garaje: "incluido" | "opcional" | "no_tiene";
  piscina: "privada" | "comunitaria" | "no_tiene";
  orientacion: "norte" | "sur" | "este" | "oeste" | "noreste" | "noroeste" | "sureste" | "suroeste";
  exterior: "exterior" | "interior";
  estado: "a_reformar" | "para_actualizar" | "buen_estado" | "reformado" | "a_estrenar";
  luminosidad: "oscuro" | "poca_luz" | "luminoso" | "muy_luminoso";
  ruido: "muy_ruidoso" | "algo_ruidoso" | "tranquilo" | "muy_tranquilo";
  calidad_acabados: "basica" | "media" | "alta" | "lujo";
  vistas: "mar" | "montana" | "ciudad" | "jardin" | "sin_vistas_destacables";
  certificado_energetico: "a" | "b" | "c" | "d" | "e" | "f" | "g" | "en_tramite" | "exento";
}
