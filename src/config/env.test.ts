import { describe, expect, it } from "vitest";
import { GATEWAY_BASE_URL, loadConfig, TYPESAFE_BASE_URL } from "./env";

describe("loadConfig", () => {
  it("sin claves usa el Jev simulado", () => {
    expect(loadConfig({}).jev.via).toBe("fake");
  });

  it("TypeSafe directo con los valores por defecto de la especificación", () => {
    const { jev } = loadConfig({ TYPESAFE_API_KEY: "ts_123" });
    expect(jev).toMatchObject({ via: "typesafe", baseURL: TYPESAFE_BASE_URL, model: "jev-latest" });
  });

  it("JEV_BASE_URL y JEV_MODEL sobrescriben", () => {
    const { jev } = loadConfig({ TYPESAFE_API_KEY: "k", JEV_BASE_URL: "https://jev.local", JEV_MODEL: "jev-x" });
    expect(jev).toMatchObject({ baseURL: "https://jev.local", model: "jev-x" });
  });

  it("AI Gateway con clave o con OIDC de Vercel", () => {
    expect(loadConfig({ AI_GATEWAY_API_KEY: "vck_1" }).jev).toMatchObject({ via: "ai-gateway", baseURL: GATEWAY_BASE_URL, model: "typesafe-ai/jev", oidc: false });
    expect(loadConfig({ VERCEL: "1" }).jev).toMatchObject({ via: "ai-gateway", oidc: true });
  });

  it("JEV_FAKE fuerza el simulado aunque haya clave", () => {
    expect(loadConfig({ TYPESAFE_API_KEY: "k", JEV_FAKE: "true" }).jev.via).toBe("fake");
  });

  it("las variables vacías cuentan como no definidas", () => {
    expect(loadConfig({ TYPESAFE_API_KEY: "  " }).jev.via).toBe("fake");
  });

  it("en producción exige Supabase", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rechaza valores no válidos con un mensaje legible", () => {
    expect(() => loadConfig({ JEV_TIMEOUT_MS: "rápido" })).toThrow(/JEV_TIMEOUT_MS/);
  });
});
