import "server-only";
import { loadConfig, type ServerConfig } from "@/config/env";
import { createJev } from "@/jev/factory";
import type { JevPort } from "@/jev/port";
import { logger } from "@/observability/logger";
import { Metrics } from "@/observability/metrics";

// Dependencias del servidor, creadas una vez por proceso. Los tests construyen las suyas.
let runtime: { config: ServerConfig; metrics: Metrics; jev: JevPort } | null = null;

export function getRuntime() {
  if (!runtime) {
    const config = loadConfig();
    const metrics = new Metrics(config.jev.pricePerMtokUsd);
    const jev = createJev(config, metrics);
    logger.info("runtime.listo", { jev: config.jev.via, model: jev.model });
    runtime = { config, metrics, jev };
  }
  return runtime;
}
