import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";

const ROOT = path.resolve(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("marca", () => {
  it("el nombre comercial solo está escrito en src/config/brand.ts", () => {
    const needles = ["{{NOMBRE_INMOBILIARIA}}", BRAND.name].filter((n) => n.trim().length >= 3);
    const offenders = walk(ROOT)
      .filter((file) => !file.endsWith(path.join("config", "brand.ts")) && !file.endsWith("brand.test.ts"))
      .filter((file) => {
        const text = fs.readFileSync(file, "utf8");
        return needles.some((needle) => text.includes(needle));
      })
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("los colores son hexadecimales válidos", () => {
    expect(BRAND.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(BRAND.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
