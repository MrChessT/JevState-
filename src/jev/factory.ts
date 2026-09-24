import type { ServerConfig } from "@/config/env";
import type { Metrics } from "@/observability/metrics";
import { LruCache } from "./cache";
import { JevClient } from "./client";
import { FakeJev } from "./fake";
import type { JevPort } from "./port";

/** Construye el JevPort según la configuración: real (TypeSafe o AI Gateway) o simulado. */
export function createJev(config: ServerConfig, metrics: Metrics): JevPort {
  const jev = config.jev;
  if (jev.via === "fake") return new FakeJev();
  const apiKey = jev.oidc
    ? async () => {
        const { getVercelOidcToken } = await import("@vercel/oidc");
        return getVercelOidcToken();
      }
    : jev.apiKey;
  return new JevClient({
    apiKey,
    baseURL: jev.baseURL,
    model: jev.model,
    via: jev.via,
    timeoutMs: jev.timeoutMs,
    maxRetries: jev.maxRetries,
    cacheTtlMs: jev.cacheTtlMs,
    cache: new LruCache(jev.cacheMaxEntries, jev.cacheTtlMs),
    metrics,
  });
}
