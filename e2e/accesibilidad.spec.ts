import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// WCAG 2.2 AA automático en cada página publicada, en claro y en oscuro.
const PAGINAS = ["/", "/en", "/venta", "/venta/murcia", "/en/rent", "/zonas", "/zonas/cartagena", "/agencia", "/favoritos", "/comparar", "/asistente", "/en/assistant", "/legal/aviso-legal", "/legal/privacidad", "/en/legal/cookies", "/cuenta/entrar", "/no-existe"];
const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("axe: ficha de un inmueble (claro y oscuro)", async ({ page }) => {
  await page.goto("/venta/murcia");
  const url = await page.locator("article h3 a").first().getAttribute("href");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(url!);
    const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});

for (const tema of ["claro", "oscuro"] as const) {
  for (const ruta of PAGINAS) {
    test(`axe ${tema}: ${ruta}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: tema === "oscuro" ? "dark" : "light" });
      await page.goto(ruta);
      const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
      const resumen = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      expect(resumen).toEqual([]);
    });
  }
}
