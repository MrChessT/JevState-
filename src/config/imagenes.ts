// Fotografías de ambiente (portada, zonas, secciones). Licencia Unsplash: uso comercial gratuito,
// sin atribución obligatoria (https://unsplash.com/license); aun así se acredita la fuente.
// No son fotos de inmuebles publicados: los inmuebles solo muestran sus propias fotos.
// Cuando haya fotografía propia de la agencia, se sustituyen aquí y en ningún otro sitio.

export interface Foto {
  id: string;
  alt: { es: string; en: string };
  pagina: string;
}

const u = (id: string, slug?: string): string => `https://unsplash.com/photos/${slug ? `${slug}-` : ""}${id}`;

/** URL de la imagen a un ancho dado (el enlace de descarga de Unsplash redirige a su CDN). */
export const urlFoto = (f: Foto, ancho = 1600) => `https://unsplash.com/photos/${f.id}/download?force=true&w=${ancho}`;

export const FOTOS = {
  portada: { id: "2d4lAQAlbDA", alt: { es: "Edificio blanco con piscina en Guardamar del Segura", en: "White building with a pool in Guardamar del Segura" }, pagina: u("2d4lAQAlbDA") },
  piscina: { id: "PJme5xAc-m4", alt: { es: "Casa de verano con jardín y piscina", en: "Summer house with garden and pool" }, pagina: u("PJme5xAc-m4") },
  aerea: { id: "p50HcC0YrL0", alt: { es: "Vista aérea de una casa blanca con piscina", en: "Aerial view of a white house with a pool" }, pagina: u("p50HcC0YrL0") },
  villa: { id: "s7cAPTHjcRQ", alt: { es: "Casa blanca con piscina", en: "White house with a pool" }, pagina: u("s7cAPTHjcRQ", "a-large-white-house-with-a-pool-in-front-of-it") },
  chalet: { id: "ylyn5r4vxcA", alt: { es: "Casa blanca junto a la piscina", en: "White house next to the pool" }, pagina: u("ylyn5r4vxcA", "white-and-brown-house-near-swimming-pool") },
  costa: { id: "cHOkA_U_CPM", alt: { es: "Casas junto al mar", en: "Houses by the sea" }, pagina: u("cHOkA_U_CPM", "yellow-and-white-houses-near-body-of-water-during-daytime") },
  frenteMar: { id: "GcjyaK_F_pY", alt: { es: "Vista aérea de casas frente al mar", en: "Aerial view of seafront houses" }, pagina: u("GcjyaK_F_pY", "aerial-view-of-houses-facing-ocean") },
  pueblo: { id: "BMtkmVf8D0Y", alt: { es: "Pueblo costero sobre el Mediterráneo", en: "Coastal village over the Mediterranean" }, pagina: u("BMtkmVf8D0Y", "coastal-village-overlooking-the-blue-mediterranean-sea") },
  salon: { id: "vFYK8li2V_s", alt: { es: "Salón luminoso con plantas", en: "Bright living room with plants" }, pagina: u("vFYK8li2V_s", "sunlight-streams-into-a-cozy-room-with-plants") },
  noche: { id: "4iEuIV8_84k", alt: { es: "Casa moderna con piscina de noche", en: "Modern house with a pool at night" }, pagina: u("4iEuIV8_84k", "a-modern-house-with-a-swimming-pool-at-night") },
} satisfies Record<string, Foto>;

/** Foto de ambiente para cada tarjeta de zona (decorativa: no muestra ese municipio). */
export const FOTO_ZONA: Record<string, Foto> = {
  murcia: FOTOS.salon,
  cartagena: FOTOS.pueblo,
  "molina-de-segura": FOTOS.chalet,
  lorca: FOTOS.villa,
  "san-javier": FOTOS.frenteMar,
  aguilas: FOTOS.costa,
};
