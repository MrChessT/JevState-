import {
  APIConnectionError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  TypeSafeError,
  UnprocessableEntityError,
} from "@typesafe-ai/sdk";

/**
 * Errores tipados de Jev (sección 1). `aborted` no es un fallo de Jev: la petición la canceló quien
 * llamó (el usuario envió otro mensaje o cerró la conexión). Se separa para no contarla como caída.
 */
export type JevErrorCode = "auth" | "invalid_request" | "rate_limited" | "timeout" | "unavailable" | "aborted";

export class JevError extends Error {
  constructor(
    readonly code: JevErrorCode,
    message: string,
    options?: { cause?: unknown; retryAfterMs?: number },
  ) {
    super(message, options);
    this.name = "JevError";
    this.retryAfterMs = options?.retryAfterMs;
  }

  readonly retryAfterMs: number | undefined;

  /** ¿Tiene sentido degradar a «sin Jev» y seguir? Todo menos una petición mal formada (bug nuestro). */
  get degradable(): boolean {
    return this.code !== "invalid_request";
  }
}

export function toJevError(err: unknown): JevError {
  if (err instanceof JevError) return err;
  // El orden importa: APITimeoutError hereda de APIConnectionError.
  if (err instanceof APIUserAbortError) return new JevError("aborted", "Petición a Jev cancelada", { cause: err });
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) return new JevError("auth", "Credenciales de Jev no válidas o sin permiso", { cause: err });
  if (err instanceof BadRequestError || err instanceof UnprocessableEntityError || err instanceof NotFoundError)
    return new JevError("invalid_request", `Jev rechazó la petición: ${err.message}`, { cause: err });
  if (err instanceof RateLimitError) return new JevError("rate_limited", "Límite de peticiones de Jev", { cause: err, retryAfterMs: err.retryAfterMs });
  if (err instanceof APITimeoutError) return new JevError("timeout", "Jev no respondió a tiempo", { cause: err });
  if (err instanceof APIConnectionError || err instanceof TypeSafeError) return new JevError("unavailable", err.message, { cause: err });
  if (err instanceof Error && err.name === "AbortError") return new JevError("aborted", "Petición a Jev cancelada", { cause: err });
  return new JevError("unavailable", err instanceof Error ? err.message : String(err), { cause: err });
}
