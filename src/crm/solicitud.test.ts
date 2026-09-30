import { describe, expect, it } from "vitest";
import { emailAgencia, emailCliente } from "./plantillas";
import { fechaMinima, preferenciaVisita, SolicitudContacto } from "./solicitud";

const base = { nombre: "Ana", email: "ana@ejemplo.es", consentimiento: true };

describe("solicitud de contacto", () => {
  it("acepta email o teléfono y exige consentimiento", () => {
    expect(SolicitudContacto.safeParse(base).success).toBe(true);
    expect(SolicitudContacto.safeParse({ ...base, email: "", telefono: "+34 600 000 000" }).success).toBe(true);
    expect(SolicitudContacto.safeParse({ ...base, email: "" }).success).toBe(false);
    expect(SolicitudContacto.safeParse({ ...base, consentimiento: false }).success).toBe(false);
    expect(SolicitudContacto.safeParse({ ...base, email: "no-es-email" }).success).toBe(false);
    expect(SolicitudContacto.safeParse({ ...base, campo: "terraza,ascensor" }).success).toBe(true);
    expect(SolicitudContacto.safeParse({ ...base, web: "spam" }).success).toBe(false);
  });

  it("interpreta la preferencia de visita (hora de Madrid)", () => {
    const jueves = new Date("2026-10-01T09:00:00Z");
    expect(preferenciaVisita("el sábado por la tarde", jueves)).toEqual({ fecha: "2026-10-03", franja: "tarde" });
    expect(preferenciaVisita("mañana por la mañana", jueves)).toEqual({ fecha: "2026-10-02", franja: "manana" });
    expect(preferenciaVisita("pasado mañana", jueves).fecha).toBe("2026-10-03");
    expect(preferenciaVisita("next thursday morning", jueves)).toEqual({ fecha: "2026-10-08", franja: "manana" });
    expect(preferenciaVisita("quiero verlo", jueves)).toEqual({ fecha: null, franja: "indiferente" });
    expect(fechaMinima(jueves)).toBe("2026-10-02");
  });

  it("los emails incluyen los datos útiles y avisan en modo demo", () => {
    const s = SolicitudContacto.parse({ ...base, tipo: "visita", ref: "A1", fecha: "2026-10-03", franja: "tarde", mensaje: "Hola" });
    const a = emailAgencia(s, "https://x.es/ficha", false);
    expect(a.asunto).toMatch(/A1/);
    expect(a.texto).toMatch(/ana@ejemplo\.es/);
    expect(a.texto).toMatch(/2026-10-03/);
    const c = emailCliente({ ...s, locale: "en" }, "https://x.es/ficha");
    expect(c.texto).toMatch(/Ana/);
  });
});
