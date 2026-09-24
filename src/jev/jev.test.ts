import { noul, choice, score } from "@typesafe-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { Metrics } from "@/observability/metrics";
import { LruCache } from "./cache";
import { cacheKey, JevClient } from "./client";
import { JevError, toJevError } from "./errors";
import { choiceAnswer, choiceDist, confidenceOf, FakeJev } from "./fake";
import { stableStringify } from "./stable";

const questions = { terraza: noul("Does the property have a terrace?") };

function client(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, extra: { maxRetries?: number } = {}) {
  const metrics = new Metrics();
  const jev = new JevClient({
    apiKey: "ts_test",
    baseURL: "https://jev.test",
    model: "jev-latest",
    via: "typesafe",
    timeoutMs: 500,
    maxRetries: extra.maxRetries ?? 0,
    cacheTtlMs: 60_000,
    cache: new LruCache(100, 60_000),
    metrics,
    fetch: fetchImpl,
  });
  return { jev, metrics };
}

const ok = () =>
  new Response(JSON.stringify({ model: "jev-1", answers: { terraza: { type: "noul", noul: 0.93 } }, usage: { input_tokens: 120, output_tokens: 1 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("stableStringify y clave de caché", () => {
  it("no depende del orden de las claves", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("cambia con el modelo, la versión del catálogo, el state o las preguntas", () => {
    const base = cacheKey("m", "v1", { x: 1 }, questions);
    expect(cacheKey("m2", "v1", { x: 1 }, questions)).not.toBe(base);
    expect(cacheKey("m", "v2", { x: 1 }, questions)).not.toBe(base);
    expect(cacheKey("m", "v1", { x: 2 }, questions)).not.toBe(base);
    expect(cacheKey("m", "v1", { x: 1 }, { terraza: noul("Does it have a balcony?") })).not.toBe(base);
  });
});

describe("JevClient (SDK real con transporte simulado)", () => {
  it("envía la petición, mide tokens y cachea", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const { jev, metrics } = client(fetchImpl);
    const req = { purpose: "sde.fisico" as const, state: { text: "terraza de 20 m2" }, questions, catalogVersion: "v1" };
    const first = await jev.ask(req);
    expect(first).toMatchObject({ cached: false, model: "jev-1" });
    expect(first.answers.terraza).toEqual({ type: "noul", noul: 0.93 });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ model: "jev-latest", state: { text: "terraza de 20 m2" } });
    const second = await jev.ask(req);
    expect(second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(metrics.snapshot().jev).toMatchObject({ calls: 1, cacheHits: 1, inputTokens: 120 });
  });

  it("comparte peticiones idénticas en vuelo", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const { jev } = client(fetchImpl);
    const req = { purpose: "eval" as const, state: "x", questions, catalogVersion: "v1" };
    await Promise.all([jev.ask(req), jev.ask(req)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [400, "invalid_request"],
    [422, "invalid_request"],
    [429, "rate_limited"],
    [503, "unavailable"],
  ])("HTTP %i → %s", async (status, code) => {
    const { jev, metrics } = client(async () => new Response(JSON.stringify({ error: "x" }), { status, headers: { "content-type": "application/json" } }));
    await expect(jev.ask({ purpose: "eval", state: "x", questions, catalogVersion: "v1" })).rejects.toMatchObject({ name: "JevError", code });
    expect(metrics.snapshot().jev.errors).toBe(1);
  });

  it("timeout → timeout", async () => {
    const { jev } = client(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (init?.signal?.aborted) abort();
          init?.signal?.addEventListener("abort", abort);
        }),
    );
    await expect(jev.ask({ purpose: "eval", state: "x", questions, catalogVersion: "v1" })).rejects.toMatchObject({ code: "timeout" });
  });

  it("cancelación del llamante → aborted (no cuenta como error de Jev)", async () => {
    const controller = new AbortController();
    const { jev, metrics } = client(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (init?.signal?.aborted) abort();
          init?.signal?.addEventListener("abort", abort);
        }),
    );
    const pending = jev.ask({ purpose: "eval", state: "x", questions, catalogVersion: "v1", signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(metrics.snapshot().jev.errors).toBe(0);
  });

  it("sin clave → auth", async () => {
    const metrics = new Metrics();
    const jev = new JevClient({ apiKey: undefined, baseURL: "https://x", model: "m", via: "typesafe", timeoutMs: 100, maxRetries: 0, cacheTtlMs: 0, cache: new LruCache(1, 0), metrics });
    await expect(jev.ask({ purpose: "eval", state: "x", questions, catalogVersion: "v1" })).rejects.toMatchObject({ code: "auth" });
  });

  it("errores desconocidos → unavailable, y solo invalid_request no es degradable", () => {
    expect(toJevError(new Error("boom")).code).toBe("unavailable");
    expect(new JevError("invalid_request", "x").degradable).toBe(false);
    expect(new JevError("timeout", "x").degradable).toBe(true);
  });
});

describe("FakeJev", () => {
  const qs = {
    intencion: choice("What?", { buscar: "a", conversar: "b", no_indicado: "c" }),
    ambiguo: noul("Missing?"),
    estado: score("Condition?", ["0: bad", "1: ok", "2: good"]),
  };

  it("sin guion responde de forma prudente y determinista", async () => {
    const jev = new FakeJev();
    const res = await jev.ask({ purpose: "eval", state: null, questions: qs, catalogVersion: "v" });
    expect(res.answers.intencion).toMatchObject({ type: "choice", choice: "no_indicado" });
    expect(res.answers.ambiguo).toEqual({ type: "noul", noul: 0.05 });
    expect(res.answers.estado).toMatchObject({ type: "score", score: 0, confidence: 0.5 });
  });

  it("sigue el guion por llamada y el responder", async () => {
    const jev = new FakeJev({
      scripts: [{ intencion: "buscar", estado: { score: 1.5, confidence: 0.8 } }],
      responder: (id) => (id === "ambiguo" ? 0.9 : undefined),
    });
    const res = await jev.ask({ purpose: "eval", state: null, questions: qs, catalogVersion: "v" });
    expect(res.answers.intencion).toMatchObject({ choice: "buscar" });
    expect(res.answers.ambiguo).toEqual({ type: "noul", noul: 0.9 });
    expect(res.answers.estado).toMatchObject({ score: 1.5, probabilities: { "1": 0.5, "2": 0.5 } });
    expect(jev.calls).toHaveLength(1);
  });

  it("falla con opciones inexistentes (el guion no puede mentir)", async () => {
    const jev = new FakeJev({ scripts: [{ intencion: "comprar" }] });
    await expect(jev.ask({ purpose: "eval", state: null, questions: qs, catalogVersion: "v" })).rejects.toThrow(/no existe/);
  });

  it("simula errores y cancelación", async () => {
    const jev = new FakeJev();
    jev.failNext = new JevError("rate_limited", "x");
    await expect(jev.ask({ purpose: "eval", state: null, questions: qs, catalogVersion: "v" })).rejects.toMatchObject({ code: "rate_limited" });
    await expect(jev.ask({ purpose: "eval", state: null, questions: qs, catalogVersion: "v" })).resolves.toBeDefined();
    const c = new AbortController();
    c.abort();
    await expect(jev.ask({ purpose: "eval", state: null, questions: qs, catalogVersion: "v", signal: c.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("la confianza sigue la fórmula del SDK", () => {
    expect(confidenceOf([1, 0, 0])).toBe(1);
    expect(confidenceOf([0.5, 0.5])).toBe(0);
    expect(choiceAnswer(["a", "b"], "a", 0.9).confidence).toBeCloseTo(0.8);
    expect(choiceDist(["a", "b", "c"], { a: 0.6 }).probabilities).toEqual({ a: 0.6, b: 0.2, c: 0.2 });
  });
});
