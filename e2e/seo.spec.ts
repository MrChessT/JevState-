import { expect, test, type Page } from "@playwright/test";

// SEO técnico de cada página indexable: título y descripción propios, canónica absoluta,
// hreflang completo, un solo h1, imagen para compartir y JSON-LD válido.
const INDEXABLES = ["/", "/en", "/venta", "/venta/murcia", "/alquiler/cartagena", "/en/sale/murcia", "/zonas", "/zonas/cartagena", "/agencia", "/asistente", "/en/assistant"];

async function meta(page: Page) {
  return page.evaluate(() => {
    const attr = (sel: string, a = "content") => document.querySelector(sel)?.getAttribute(a) ?? null;
    return {
      titulo: document.title,
      descripcion: attr('meta[name="description"]'),
      canonica: attr('link[rel="canonical"]', "href"),
      idiomas: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.getAttribute("hreflang")),
      h1: document.querySelectorAll("h1").length,
      ogImagen: attr('meta[property="og:image"]'),
      twitter: attr('meta[name="twitter:card"]'),
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ""),
      imagenesSinAlt: [...document.querySelectorAll("img:not([alt])")].length,
    };
  });
}

test.describe("SEO", () => {
  test("cada página indexable tiene metadatos completos y únicos", async ({ page }) => {
    const titulos = new Set<string>();
    for (const ruta of INDEXABLES) {
      await page.goto(ruta);
      const m = await meta(page);
      expect(m.titulo.length, ruta).toBeGreaterThan(10);
      expect(titulos.has(m.titulo), `título repetido en ${ruta}`).toBe(false);
      titulos.add(m.titulo);
      expect(m.descripcion?.length ?? 0, ruta).toBeGreaterThan(50);
      expect(m.canonica, ruta).toMatch(/^https?:\/\//);
      expect(new URL(m.canonica!).pathname.replace(/\/$/, ""), ruta).toBe(ruta.replace(/\/$/, ""));
      expect(m.idiomas, ruta).toEqual(expect.arrayContaining(["es-ES", "en-GB", "x-default"]));
      expect(m.h1, ruta).toBe(1);
      expect(m.ogImagen, ruta).toMatch(/\/api\/og\//);
      expect(m.twitter, ruta).toBe("summary_large_image");
      expect(m.imagenesSinAlt, ruta).toBe(0);
      for (const j of m.jsonld) expect(() => JSON.parse(j), ruta).not.toThrow();
    }
  });

  test("ficha: imagen propia para compartir, migas y RealEstateListing", async ({ page, request }) => {
    await page.goto("/venta/murcia");
    const href = await page.locator("article h3 a").first().getAttribute("href");
    await page.goto(href!);
    const m = await meta(page);
    expect(m.ogImagen).toMatch(/\/api\/og\/inmueble\/FIC-\d+/);
    const tipos = m.jsonld.flatMap((j) => {
      const d = JSON.parse(j);
      return d["@graph"] ? d["@graph"].map((g: { "@type": string }) => g["@type"]) : [d["@type"]];
    });
    expect(tipos).toEqual(expect.arrayContaining(["RealEstateListing", "BreadcrumbList"]));
    const img = await request.get(new URL(m.ogImagen!).pathname + new URL(m.ogImagen!).search);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/png");
  });

  test("portada: datos de la agencia y buscador del sitio", async ({ page }) => {
    await page.goto("/");
    const grafo = (await meta(page)).jsonld.flatMap((j) => JSON.parse(j)["@graph"] ?? []);
    expect(grafo.map((g: { "@type": string }) => g["@type"])).toEqual(expect.arrayContaining(["RealEstateAgent", "WebSite"]));
  });

  test("páginas privadas o sin valor para buscadores no se indexan", async ({ page }) => {
    for (const ruta of ["/favoritos", "/comparar", "/cuenta/entrar", "/venta/murcia?precio_max=100000"]) {
      await page.goto(ruta);
      expect(await page.getAttribute('meta[name="robots"]', "content"), ruta).toContain("noindex");
    }
  });

  test("manifiesto y robots", async ({ request }) => {
    expect((await request.get("/manifest.webmanifest")).status()).toBe(200);
    expect(await (await request.get("/robots.txt")).text()).toMatch(/User-Agent/i);
  });
});
