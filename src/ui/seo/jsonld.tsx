// Datos estructurados schema.org comunes: la agencia, el sitio (con búsqueda) y las migas de pan.
import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";
import { ruta, type Locale } from "@/i18n/config";

const abs = (path: string) => `${BRAND.siteUrl}${path}`;

export function organizacion(locale: Locale): Record<string, unknown> {
  return {
    "@type": "RealEstateAgent",
    "@id": abs("/#agencia"),
    name: NOMBRE_VISIBLE,
    url: abs(ruta(locale)),
    logo: abs("/icon.svg"),
    image: abs(`/api/og/sitio?lang=${locale}`),
    telephone: BRAND.contact.phone,
    email: BRAND.contact.email,
    areaServed: { "@type": "AdministrativeArea", name: "Región de Murcia" },
    address: { "@type": "PostalAddress", streetAddress: BRAND.contact.address, addressLocality: BRAND.contact.city, addressRegion: "Región de Murcia", addressCountry: "ES" },
    ...(Object.values(BRAND.social).length ? { sameAs: Object.values(BRAND.social) } : {}),
  };
}

export function sitioWeb(locale: Locale): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": abs("/#web"),
    name: NOMBRE_VISIBLE,
    url: abs(ruta(locale)),
    inLanguage: locale === "es" ? "es-ES" : "en-GB",
    publisher: { "@id": abs("/#agencia") },
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: abs(`${ruta(locale, "asistente")}?q={search_term_string}`) }, "query-input": "required name=search_term_string" },
  };
}

export function migas(items: Array<{ nombre: string; href: string }>): Record<string, unknown> {
  return { "@type": "BreadcrumbList", itemListElement: items.map((x, k) => ({ "@type": "ListItem", position: k + 1, name: x.nombre, item: abs(x.href) })) };
}

export function listaInmuebles(urls: string[]): Record<string, unknown> {
  return { "@type": "ItemList", itemListElement: urls.map((u, k) => ({ "@type": "ListItem", position: k + 1, url: abs(u) })) };
}

/** <script type="application/ld+json"> con un @graph; evita cerrar el script desde los datos. */
export function JsonLd({ grafo }: { grafo: Array<Record<string, unknown>> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": grafo }).replace(/</g, "\\u003c") }} />;
}

/** Imagen para compartir del sitio (las páginas que definen openGraph la repiten: Next no la hereda). */
export const imagenSitio = (locale: Locale) => [{ url: `/api/og/sitio?lang=${locale}`, width: 1200, height: 630, alt: NOMBRE_VISIBLE }];
