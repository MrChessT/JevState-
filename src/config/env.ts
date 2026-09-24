// Configuración del servidor, validada con zod. Una sola lectura de process.env para todo el
// proyecto: el resto del código recibe `ServerConfig` y no toca el entorno.
import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  /** Solo trabajos en segundo plano (ingesta, enriquecimiento) y RPC públicas acotadas. Nunca en el cliente. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Jev (sección 1). TypeSafe directo o Vercel AI Gateway.
  TYPESAFE_API_KEY: z.string().min(1).optional(),
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  JEV_BASE_URL: z.url().optional(),
  JEV_MODEL: z.string().min(1).optional(),
  JEV_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
  JEV_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  JEV_CACHE_TTL_S: z.coerce.number().int().min(0).default(900),
  JEV_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(5000),
  /** Fuerza el Jev simulado aunque haya clave (desarrollo, demos, e2e). */
  JEV_FAKE: bool.optional(),
  /** Precio por millón de tokens de entrada, solo para métricas de coste. */
  JEV_PRICE_PER_MTOK_USD: z.string().regex(/^\d+(\.\d+)?$/).default("0.042"),

  // Asistente
  ASSISTANT_WRITER_LLM: bool.default(false),
  RATE_CHAT_PER_MIN_IP: z.coerce.number().int().positive().default(30),
  RATE_CHAT_PER_MIN_SESSION: z.coerce.number().int().positive().default(15),
  ANON_CONVERSATION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Plano de control (solo lo usa catalog:compile, nunca el runtime)
  CATALOG_SHEET_ID: z.string().min(10).optional(),
  CATALOG_SHEET_API_KEY: z.string().min(10).optional(),

  // Operaciones: vacacional preparado pero desactivado (sección 12)
  FEATURE_VACACIONAL: bool.default(false),

  METRICS_TOKEN: z.string().min(16).optional(),
});

export type RawEnv = z.infer<typeof EnvSchema>;

export interface JevConfig {
  apiKey: string | undefined;
  baseURL: string;
  model: string;
  via: "typesafe" | "ai-gateway" | "fake";
  /** Autenticación con el token OIDC del despliegue de Vercel (sin clave guardada). */
  oidc: boolean;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  pricePerMtokUsd: string;
}

export type ServerConfig = RawEnv & { jev: JevConfig };

export const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/typesafe";
export const TYPESAFE_BASE_URL = "https://api.typesafe.ai";

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  // "CLAVE=" vacía cuenta como no definida.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1].trim() !== ""),
  );
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Configuración no válida:\n${issues.join("\n")}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production") {
    const missing = (["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const).filter((key) => !cfg[key]);
    if (missing.length > 0) throw new Error(`Faltan variables obligatorias en producción: ${missing.join(", ")}`);
  }

  const common = {
    timeoutMs: cfg.JEV_TIMEOUT_MS,
    maxRetries: cfg.JEV_MAX_RETRIES,
    cacheTtlMs: cfg.JEV_CACHE_TTL_S * 1000,
    cacheMaxEntries: cfg.JEV_CACHE_MAX_ENTRIES,
    pricePerMtokUsd: cfg.JEV_PRICE_PER_MTOK_USD,
  };
  // Prioridad: fake forzado > TypeSafe directo > AI Gateway con clave > AI Gateway con OIDC > fake.
  const oidc = !cfg.TYPESAFE_API_KEY && !cfg.AI_GATEWAY_API_KEY && (cleaned.VERCEL === "1" || Boolean(cleaned.VERCEL_OIDC_TOKEN));
  let jev: JevConfig;
  if (cfg.JEV_FAKE) {
    jev = { apiKey: undefined, baseURL: "fake://", model: "jev-fake", via: "fake", oidc: false, ...common };
  } else if (cfg.TYPESAFE_API_KEY) {
    jev = { apiKey: cfg.TYPESAFE_API_KEY, baseURL: cfg.JEV_BASE_URL ?? TYPESAFE_BASE_URL, model: cfg.JEV_MODEL ?? "jev-latest", via: "typesafe", oidc: false, ...common };
  } else if (cfg.AI_GATEWAY_API_KEY || oidc) {
    jev = { apiKey: cfg.AI_GATEWAY_API_KEY, baseURL: cfg.JEV_BASE_URL ?? GATEWAY_BASE_URL, model: cfg.JEV_MODEL ?? "typesafe-ai/jev", via: "ai-gateway", oidc, ...common };
  } else {
    jev = { apiKey: undefined, baseURL: "fake://", model: "jev-fake", via: "fake", oidc: false, ...common };
  }
  return { ...cfg, jev };
}
