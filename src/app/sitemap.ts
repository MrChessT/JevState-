import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { INDEXABLE } from "@/config/secciones";
import { alternativas, LOCALES, ruta } from "@/i18n/config";
import { DOCS_LEGALES, LEGAL_ACTUALIZADO } from "@/legal/textos";
import { portal } from "@/portal/datos";
import { urlFicha } from "@/portal/filtros";
import { ZONAS } from "@/zonas/buscar";

// Sitemap por idioma con hreflang (sección 2.1). Los inmuebles y zonas se añaden en la fase 2.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!INDEXABLE) return [];
  const paginas: Array<{ partes: string[]; lastModified?: string }> = [
    { partes: [] },
    { partes: ["venta"] },
    { partes: ["alquiler"] },
    { partes: ["zonas"] },
    { partes: ["agencia"] },
    ...ZONAS.flatMap((z) => [{ partes: ["zonas", ...z.path.split("/")] }, { partes: ["venta", ...z.path.split("/")] }]),
    ...DOCS_LEGALES.map((doc) => ({ partes: ["legal", doc], lastModified: LEGAL_ACTUALIZADO })),
  ];
  const inmuebles = await (await portal()).todas();
  const fichas = inmuebles.flatMap((i) =>
    LOCALES.map((locale) => ({
      url: `${BRAND.siteUrl}${urlFicha(locale, i)}`,
      lastModified: i.publicadoEn,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${BRAND.siteUrl}${urlFicha(l, i)}`])) },
    })),
  );
  return [...fichas, ...paginas.flatMap(({ partes, lastModified }) =>
    LOCALES.map((locale) => ({
      url: `${BRAND.siteUrl}${ruta(locale, ...partes)}`,
      lastModified,
      alternates: { languages: alternativas(BRAND.siteUrl, ...partes) },
    })),
  )];
}
