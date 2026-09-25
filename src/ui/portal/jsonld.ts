import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";
import type { InmuebleFicha } from "@/portal/tipos";

/** schema.org RealEstateListing + Offer + Place (sección 2.1). Solo datos confirmados o probables. */
export function jsonLdInmueble(i: InmuebleFicha, url: string): Record<string, unknown> {
  const fiable = (id: string) => (["confirmado", "probable"].includes(i.campos[id]?.status ?? "") ? i.campos[id]!.value : null);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: i.titulo,
    url: `${BRAND.siteUrl}${url}`,
    datePosted: i.publicadoEn,
    // Los buscadores no indexan SVG: para las ilustraciones se usa la imagen generada del inmueble.
    image: [...i.fotos.filter((f) => !f.startsWith("/ficticios/")).map((f) => (f.startsWith("http") ? f : `${BRAND.siteUrl}${f}`)), `${BRAND.siteUrl}/api/og/inmueble/${i.ref}`],
    offers: i.precio ? { "@type": "Offer", price: i.precio, priceCurrency: "EUR", businessFunction: i.operacion === "venta" ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut", seller: { "@id": `${BRAND.siteUrl}/#agencia`, "@type": "RealEstateAgent", name: NOMBRE_VISIBLE } } : undefined,
    about: {
      "@type": "Accommodation",
      ...(fiable("superficie_construida") ? { floorSize: { "@type": "QuantitativeValue", value: Number(fiable("superficie_construida")), unitCode: "MTK" } } : {}),
      ...(fiable("habitaciones") !== null ? { numberOfBedrooms: fiable("habitaciones") } : {}),
      ...(fiable("banos") !== null ? { numberOfBathroomsTotal: fiable("banos") } : {}),
    },
    contentLocation: {
      "@type": "Place",
      name: i.zonaNombre,
      address: { "@type": "PostalAddress", addressLocality: i.municipioNombre, addressRegion: "Región de Murcia", addressCountry: "ES" },
      ...(i.lat !== null && i.lon !== null ? { geo: { "@type": "GeoCoordinates", latitude: i.lat, longitude: i.lon } } : {}),
    },
  };
}

/** Evita cerrar el <script> desde los datos. */
export const scriptJsonLd = (datos: unknown) => JSON.stringify(datos).replace(/</g, "\\u003c");
