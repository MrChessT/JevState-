// Logs estructurados en JSON (una línea por evento). Nunca se registran datos personales: los
// llamantes pasan identificadores, no emails ni teléfonos; `redact` es la última defensa.

export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogSink {
  write(line: string, level: LogLevel): void;
}

const consoleSink: LogSink = {
  write(line, level) {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  },
};

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(?:\+?\d[\s.-]?){9,}/g;

/** Elimina emails y teléfonos de cualquier cadena del evento. */
export function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(EMAIL, "[email]").replace(PHONE, "[teléfono]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
}

export class Logger {
  constructor(
    private readonly bindings: Record<string, unknown> = {},
    private readonly minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info",
    private readonly sink: LogSink = consoleSink,
  ) {}

  child(bindings: Record<string, unknown>): Logger {
    return new Logger({ ...this.bindings, ...bindings }, this.minLevel, this.sink);
  }

  log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (ORDER[level] < ORDER[this.minLevel]) return;
    const record = redact({ ts: new Date().toISOString(), level, event, ...this.bindings, ...fields });
    this.sink.write(JSON.stringify(record), level);
  }

  debug(event: string, fields?: Record<string, unknown>) { this.log("debug", event, fields); }
  info(event: string, fields?: Record<string, unknown>) { this.log("info", event, fields); }
  warn(event: string, fields?: Record<string, unknown>) { this.log("warn", event, fields); }
  error(event: string, fields?: Record<string, unknown>) { this.log("error", event, fields); }
}

export const logger = new Logger({ app: "portal" });
