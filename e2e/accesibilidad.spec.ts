import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// WCAG 2.2 AA automático en cada página publicada, en claro y en oscuro.
const PAGINAS = ["/", "/en", "/legal/aviso-legal", "/legal/privacidad", "/en/legal/cookies", "/cuenta/entrar", "/no-existe"];
const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

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
