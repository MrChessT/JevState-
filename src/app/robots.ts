import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { INDEXABLE } from "@/config/secciones";

const PRIVADO = ["/admin", "/cuenta", "/en/admin", "/en/account", "/api/", "/auth/"];

export default function robots(): MetadataRoute.Robots {
  // Sin datos reales (INDEXABLE apagado) se bloquea a todos los buscadores, salvo al auditor SEO
  // propio (jev-seo), que solo lee la web para el informe y no indexa nada.
  if (!INDEXABLE)
    return {
      rules: [
        { userAgent: "JevSEO", allow: "/api/og/", disallow: PRIVADO },
        { userAgent: "*", disallow: "/" },
      ],
      sitemap: `${BRAND.siteUrl}/sitemap.xml`,
    };
  return {
    rules: { userAgent: "*", allow: ["/", "/api/og/"], disallow: PRIVADO },
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  };
}
