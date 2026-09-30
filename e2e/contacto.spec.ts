import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Fase 5: contacto y visitas. En e2e no hay Supabase ni Resend: se registra en modo demo.
async function urlFicha(page: import("@playwright/test").Page) {
  await page.goto("/venta/murcia");
  return (await page.locator("article h3 a").first().getAttribute("href"))!;
}

test.describe("contacto y visitas (fase 5)", () => {
  test("formulario de la ficha: valida, pide consentimiento y envía", async ({ page }) => {
    await page.goto(await urlFicha(page));
    const panel = page.locator("#contacto");
    await panel.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(panel.getByText("Escribe tu nombre (mínimo 2 letras).")).toBeVisible();
    await expect(panel.getByLabel("Nombre")).toBeFocused();
    await panel.getByLabel("Nombre").fill("Ana Prueba");
    await panel.getByLabel("Email").fill("ana@ejemplo.es");
    await panel.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(panel.getByText("Necesitamos tu consentimiento para responderte.")).toBeVisible();
    await panel.getByRole("checkbox").check();
    await panel.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(panel.getByRole("status")).toContainText("Gracias, Ana.");
  });

  test("borrador del asistente: la URL prellena visita, fecha y franja, y es accesible", async ({ page }) => {
    const url = await urlFicha(page);
    const fecha = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await page.goto(`${url}?visita=1&fecha=${fecha}&franja=tarde&origen=asistente#contacto`);
    const panel = page.locator("#contacto");
    await expect(panel.getByText(/no se envía hasta que pulses/)).toBeVisible();
    await expect(panel.getByRole("radio", { name: "Visitarlo" })).toBeChecked();
    await expect(panel.getByLabel("Día preferido")).toHaveValue(fecha);
    await expect(panel.getByLabel("Franja")).toHaveValue("tarde");
    const { violations } = await new AxeBuilder({ page }).include("#contacto").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test("«no consta» pregunta al agente con el dato en el mensaje", async ({ page }) => {
    const url = await urlFicha(page);
    await page.goto(`${url}?campo=ascensor#contacto`);
    await expect(page.locator("#contacto textarea")).toHaveValue(/no consta: ascensor/);
  });

  test("API: rechaza datos inválidos y acepta en silencio a los bots", async ({ request }) => {
    const mala = await request.post("/api/contacto", { data: { nombre: "A", consentimiento: false } });
    expect(mala.status()).toBe(422);
    expect((await mala.json()).campos).toEqual(expect.arrayContaining(["nombre", "consentimiento"]));
    const inexistente = await request.post("/api/contacto", { data: { ref: "NOEXISTE9", nombre: "Ana", email: "a@b.es", consentimiento: true } });
    expect(inexistente.status()).toBe(422);
    const bot = await request.post("/api/contacto", { data: { web: "http://spam", nombre: "x" } });
    expect(bot.status()).toBe(200);
  });
});
