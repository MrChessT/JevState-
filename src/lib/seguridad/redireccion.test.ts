import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./redireccion";

describe("destinoSeguro", () => {
  it("acepta rutas internas", () => {
    expect(destinoSeguro("/cuenta")).toBe("/cuenta");
    expect(destinoSeguro("/en/account?x=1")).toBe("/en/account?x=1");
  });
  it("rechaza redirecciones abiertas", () => {
    for (const malo of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", ""]) expect(destinoSeguro(malo, "/")).toBe("/");
  });
});
