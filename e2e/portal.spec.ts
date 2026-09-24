import { expect, test } from "@playwright/test";

test.describe("portal (fase 0)", () => {
  test("inicio en español y en inglés, con el idioma en <html>", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Región de Murcia");
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Region of Murcia");
  });

  test("URL canónica única: /es/… redirige a la ruta sin prefijo", async ({ page }) => {
    const res = await page.goto("/es/legal/privacidad");
    expect(page.url()).toMatch(/\/legal\/privacidad$/);
    expect(res?.status()).toBe(200);
  });

  test("el selector de idioma mantiene la página y traduce la ruta", async ({ page }) => {
    await page.goto("/legal/privacidad");
    await page.getByLabel("Idioma").selectOption("en");
    await expect(page).toHaveURL(/\/en\/legal\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
  });

  test("enlace para saltar al contenido", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const saltar = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(saltar).toBeFocused();
    await saltar.press("Enter");
    await expect(page.locator("#contenido")).toBeFocused();
  });

  test("tema oscuro elegido se mantiene al recargar", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Tema").selectOption("oscuro");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("404 con el diseño del portal y en el idioma de la ruta", async ({ page }) => {
    const res = await page.goto("/en/this-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We could not find this page");
  });

  test("magic link: valida el email sin revelar si existe la cuenta", async ({ page }) => {
    await page.goto("/cuenta/entrar");
    await page.getByLabel("Email").fill("no-es-un-email");
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Escribe un email válido" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("cuenta y backoffice exigen sesión", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/cuenta\/entrar$/);
    await page.goto("/en/account");
    await expect(page).toHaveURL(/\/en\/account\/sign-in$/);
  });

  test("salud del portal sin Supabase alcanzable ni Jev real", async ({ request }) => {
    const res = await request.get("/api/salud");
    expect(res.ok()).toBe(true);
    expect(await res.json()).toMatchObject({ ok: true, jev: { via: "fake" } });
  });
});

test("sin scroll horizontal en ninguna página (móvil de 360 px)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const ruta of ["/", "/en", "/legal/privacidad", "/cuenta/entrar", "/no-existe"]) {
    await page.goto(ruta);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde, ruta).toBeLessThanOrEqual(0);
  }
});
