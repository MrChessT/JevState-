// Adaptador real de JevPort sobre @typesafe-ai/sdk 0.6.0. Firmas comprobadas en
// node_modules/@typesafe-ai/sdk/dist/index.d.mts (ver docs/DECISIONES.md, D-003).
import { TypeSafeClient, type EntryType, type Fetch, type Questions } from "@typesafe-ai/sdk";
import type { Metrics } from "@/observability/metrics";
import type { Cache } from "./cache";
import { JevError, toJevError } from "./errors";
import type { JevAnswer, JevHealth, JevPort, JevRequest, JevResult } from "./port";
import { stableHash } from "./stable";

/** Clave de caché: hash estable de (modelo + versión del catálogo + state + preguntas). */
export function cacheKey(model: string, catalogVersion: string, state: EntryType, questions: Questions): string {
  return stableHash({ model, catalogVersion, state, questions });
}

export type ApiKeySource = string | undefined | (() => Promise<string | undefined>);

export interface JevClientOptions {
  /** Clave fija, o función (el token OIDC de Vercel caduca y se renueva). */
  apiKey: ApiKeySource;
  baseURL: string;
  model: string;
  via: "typesafe" | "ai-gateway";
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cache: Cache<Omit<JevResult, "cached" | "latencyMs">>;
  metrics: Metrics;
  /** Solo tests: transporte HTTP alternativo. */
  fetch?: Fetch;
}

export class JevClient implements JevPort {
  #client: TypeSafeClient | null = null;
  #clientKey: string | null = null;
  /** Peticiones idénticas en vuelo: se comparten en lugar de duplicarse. */
  readonly #inflight = new Map<string, Promise<Omit<JevResult, "cached" | "latencyMs">>>();

  constructor(private readonly options: JevClientOptions) {}

  get model(): string {
    return this.options.model;
  }

  private async client(): Promise<TypeSafeClient> {
    const key = typeof this.options.apiKey === "function" ? await this.options.apiKey() : this.options.apiKey;
    if (!key) throw new JevError("auth", "Falta TYPESAFE_API_KEY o AI_GATEWAY_API_KEY");
    if (this.#client && this.#clientKey === key) return this.#client;
    this.#clientKey = key;
    this.#client = new TypeSafeClient({
      apiKey: key,
      baseURL: this.options.baseURL,
      defaultModel: this.options.model,
      timeout: this.options.timeoutMs,
      retry: { maxRetries: this.options.maxRetries },
      logLevel: "off",
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
    return this.#client;
  }

  async ask(request: JevRequest): Promise<JevResult> {
    const { purpose, state, questions, catalogVersion, signal } = request;
    if (signal?.aborted) throw new JevError("aborted", "Petición a Jev cancelada");
    const t0 = performance.now();
    const key = cacheKey(this.options.model, catalogVersion, state, questions);
    const hit = this.options.cache.get(key);
    if (hit) {
      this.options.metrics.recordJev(purpose, hit.usage, true, 0);
      return { ...hit, cached: true, latencyMs: 0 };
    }
    // Solo se comparten peticiones sin señal: si un llamante cancela, no debe cancelar la de otro.
    let pending = signal ? undefined : this.#inflight.get(key);
    if (!pending) {
      pending = (async () => {
        const response = await (await this.client()).systemOne({ state, questions }, { signal });
        return { model: response.model, answers: response.answers as Record<string, JevAnswer>, usage: response.usage };
      })();
      if (!signal) {
        this.#inflight.set(key, pending);
        pending.finally(() => this.#inflight.delete(key)).catch(() => undefined);
      }
    }
    try {
      const result = await pending;
      const latencyMs = Math.round(performance.now() - t0);
      this.options.metrics.recordJev(purpose, result.usage, false, latencyMs);
      this.options.cache.set(key, result, this.options.cacheTtlMs);
      return { ...result, cached: false, latencyMs };
    } catch (err) {
      const jevError = toJevError(err);
      if (jevError.code !== "aborted") this.options.metrics.recordJevError(jevError.code);
      throw jevError;
    }
  }

  async health(): Promise<JevHealth> {
    const t0 = performance.now();
    try {
      const models = await (await this.client()).models.list({ timeout: 3000, retry: { maxRetries: 0 } });
      return { ok: models.length > 0, model: this.options.model, latencyMs: Math.round(performance.now() - t0), via: this.options.via };
    } catch {
      return { ok: false, model: null, latencyMs: null, via: this.options.via };
    }
  }
}
