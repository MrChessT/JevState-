import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/gates/thresholds";
import { JevError } from "@/jev/errors";
import { FakeJev } from "@/jev/fake";
import { construirRepoFicticio } from "@/portal/repo-memoria";
import { pruebaAsistente } from "./prueba";

describe("prueba del asistente con Jev", async () => {
  const repo = await construirRepoFicticio(300);

  it("registra cada llamada a Jev y el resultado de cada turno", async () => {
    const jev = new FakeJev({ scripts: [{ intencion: "buscar", operacion: "compra" }, { intencion: "refinar" }] });
    const r = await pruebaAsistente({ jev, repo, thresholds: DEFAULT_THRESHOLDS });
    expect(r.turnos).toHaveLength(2);
    expect(r.llamadas.length).toBeGreaterThan(0);
    expect(r.llamadas.every((l) => l.ok)).toBe(true);
  });

  it("si Jev falla lo dice con el código del error y marca el modo básico", async () => {
    const jev = new FakeJev();
    jev.failAlways = new JevError("timeout", "tarde");
    const r = await pruebaAsistente({ jev, repo, thresholds: DEFAULT_THRESHOLDS });
    expect(r.ok).toBe(false);
    expect(r.llamadas[0]).toMatchObject({ ok: false, error: "timeout" });
    expect(r.turnos[0]!.modoBasico).toBe(true);
  });
});
