import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { INDEXABLE } from "@/config/secciones";
import { alternativas, LOCALES, ruta } from "@/i18n/config";
import { DOCS_LEGALES, LEGAL_ACTUALIZADO } from "@/legal/textos";
import { portal } from "@/portal/datos";
import { urlFicha } from "@/portal/filtros";
import { ZONAS } from "@/zonas/buscar";

// Sitemap por idioma con hreflang (sección 2.1): portada, listados y zonas con oferta, fichas con su imagen.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!INDEXABLE) return [];
  const inmuebles = await (await portal()).todas();
  // Solo zonas con oferta: una página de zona vacía es contenido pobre para los buscadores.
  const conOferta = (op: "venta" | "alquiler") => new Set(inmuebles.filter((i) => (op === "venta" ? i.operacion === "venta" : i.operacion !== "venta")).flatMap((i) => [i.zonaPath, i.zonaPath.split("/")[0]!]));
  const venta = conOferta("venta");
  const alquiler = conOferta("alquiler");
  const paginas: Array<{ partes: string[]; lastModified?: string; priority?: number; changeFrequency?: "daily" | "weekly" | "monthly" | "yearly" }> = [
    { partes: [], priority: 1, changeFrequency: "daily" },
    { partes: ["venta"], priority: 0.9, changeFrequency: "daily" },
    { partes: ["alquiler"], priority: 0.9, changeFrequency: "daily" },
    { partes: ["asistente"], priority: 0.8, changeFrequency: "monthly" },
    { partes: ["zonas"], priority: 0.7, changeFrequency: "weekly" },
    { partes: ["agencia"], priority: 0.5, changeFrequency: "monthly" },
    ...ZONAS.filter((z) => venta.has(z.path) || alquiler.has(z.path)).map((z) => ({ partes: ["zonas", ...z.path.split("/")], priority: 0.6, changeFrequency: "weekly" as const })),
    ...ZONAS.filter((z) => venta.has(z.path)).map((z) => ({ partes: ["venta", ...z.path.split("/")], priority: 0.7, changeFrequency: "daily" as const })),
    ...ZONAS.filter((z) => alquiler.has(z.path)).map((z) => ({ partes: ["alquiler", ...z.path.split("/")], priority: 0.7, changeFrequency: "daily" as const })),
    ...DOCS_LEGALES.map((doc) => ({ partes: ["legal", doc], lastModified: LEGAL_ACTUALIZADO, priority: 0.1, changeFrequency: "yearly" as const })),
  ];
  const fichas = inmuebles.flatMap((i) =>
    LOCALES.map((locale) => ({
      url: `${BRAND.siteUrl}${urlFicha(locale, i)}`,
      lastModified: i.publicadoEn,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: [`${BRAND.siteUrl}/api/og/inmueble/${i.ref}?lang=${locale}`],
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${BRAND.siteUrl}${urlFicha(l, i)}`])) },
    })),
  );
  return [...paginas.flatMap(({ partes, lastModified, priority, changeFrequency }) =>
    LOCALES.map((locale) => ({
      url: `${BRAND.siteUrl}${ruta(locale, ...partes)}`,
      lastModified,
      priority,
      changeFrequency,
      alternates: { languages: alternativas(BRAND.siteUrl, ...partes) },
    })),
  ), ...fichas];
}
