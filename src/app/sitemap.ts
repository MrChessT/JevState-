import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { INDEXABLE } from "@/config/secciones";
import { alternativas, LOCALES, ruta } from "@/i18n/config";
import { DOCS_LEGALES, LEGAL_ACTUALIZADO } from "@/legal/textos";

// Sitemap por idioma con hreflang (sección 2.1). Los inmuebles y zonas se añaden en la fase 2.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXABLE) return [];
  const paginas: Array<{ partes: string[]; lastModified?: string }> = [{ partes: [] }, ...DOCS_LEGALES.map((doc) => ({ partes: ["legal", doc], lastModified: LEGAL_ACTUALIZADO }))];
  return paginas.flatMap(({ partes, lastModified }) =>
    LOCALES.map((locale) => ({
      url: `${BRAND.siteUrl}${ruta(locale, ...partes)}`,
      lastModified,
      alternates: { languages: alternativas(BRAND.siteUrl, ...partes) },
    })),
  );
}
