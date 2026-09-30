import { describe, expect, it } from "vitest";
import { urlSupabase } from "./env";

describe("urlSupabase", () => {
  it("se queda con el origen aunque se pegue la URL de la API REST", () => {
    expect(urlSupabase("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(urlSupabase(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
    expect(urlSupabase("https://abc.supabase.co")).toBe("https://abc.supabase.co");
  });
});
