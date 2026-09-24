import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";
import { INDEXABLE } from "@/config/secciones";

export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/cuenta", "/en/admin", "/en/account", "/api/", "/auth/"] },
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  };
}
