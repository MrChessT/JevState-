import { expect, test } from "@playwright/test";

test.describe("portal (fase 2)", () => {
  test("buscador rápido → resultados canónicos → ficha", async ({ page }) => {
    await page.goto("/");
    const buscador = page.getByRole("form", { name: "Filtros" });
    await buscador.getByLabel("Zona").selectOption("cartagena");
    await buscador.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/venta\/cartagena$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inmuebles en venta en Cartagena");
    const primera = page.locator("article h3 a").first();
    const titulo = await primera.innerText();
    await primera.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
    await expect(page.getByRole("heading", { name: "Datos clave" })).toBeVisible();
    await expect(page.getByText("Cálculo orientativo")).toBeVisible();
  });

  test("filtros: requisitos con estado confirmado o probable y URL canónica", async ({ page }) => {
    await page.goto("/venta");
    const filtros = page.getByRole("form", { name: "Filtros" });
    await filtros.getByRole("checkbox", { name: "Terraza" }).check();
    await filtros.getByLabel("Precio máximo").fill("200000");
    await filtros.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page).toHaveURL(/\/venta\?precio_max=200000&con=terraza$/);
    const tarjetas = page.locator("article");
    await expect(tarjetas.first()).toBeVisible();
    for (const t of await tarjetas.all()) await expect(t.locator("ul li").filter({ hasText: "Terraza" })).toHaveCount(1);
  });

  test("ficha: características con su estado y «no consta» con opción de preguntar", async ({ page }) => {
    await page.goto("/venta/murcia");
    await page.locator("article h3 a").first().click();
    await expect(page.getByText("Confirmado").first()).toBeVisible();
    await expect(page.locator("script[type='application/ld+json']")).toHaveCount(1);
    const ld = JSON.parse((await page.locator("script[type='application/ld+json']").textContent())!);
    expect(ld["@type"]).toBe("RealEstateListing");
  });

  test("favoritos y comparador sin cuenta", async ({ page }) => {
    await page.goto("/venta/cartagena");
    const tarjetas = page.locator("article");
    await tarjetas.nth(0).getByRole("button", { name: "Guardar en favoritos" }).click();
    await tarjetas.nth(0).getByRole("button", { name: "Comparar" }).click();
    await tarjetas.nth(1).getByRole("button", { name: "Comparar" }).click();
    const t1 = await tarjetas.nth(0).locator("h3").innerText();
    await page.goto("/favoritos");
    await expect(page.locator("article h3")).toHaveText([t1]);
    await page.goto("/comparar");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveCount(3);
  });

  test("buscador sin JavaScript (GET a /api/buscar)", async ({ request }) => {
    const r = await request.get("/api/buscar?lang=en&operacion=alquiler&zona=murcia&hab_min=2", { maxRedirects: 0 });
    expect(r.status()).toBe(303);
    expect(r.headers().location).toMatch(/\/en\/rent\/murcia\?hab_min=2$/);
  });

  test("inglés: rutas traducidas y ficha", async ({ page }) => {
    await page.goto("/en/sale");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Properties for sale");
    await page.locator("article h3 a").first().click();
    await expect(page).toHaveURL(/\/en\/sale\/.+-ref-fic-\d+$/);
    await expect(page.getByRole("heading", { name: "Key facts" })).toBeVisible();
  });
});
