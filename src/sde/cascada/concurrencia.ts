import { JevError } from "@/jev/errors";

/** Limita cuántas tareas corren a la vez. */
export function limitador(max: number) {
  let activas = 0;
  const cola: Array<() => void> = [];
  const siguiente = () => {
    if (activas >= max) return;
    const t = cola.shift();
    if (t) {
      activas++;
      t();
    }
  };
  return function <T>(tarea: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      cola.push(() => {
        tarea()
          .then(resolve, reject)
          .finally(() => {
            activas--;
            siguiente();
          });
      });
      siguiente();
    });
  };
}

export interface OpcionesReintento {
  intentos: number;
  baseMs: number;
  maxMs: number;
  dormir?: (ms: number) => Promise<void>;
}

/** Reintenta errores de Jev recuperables (rate_limited, timeout, unavailable) con backoff exponencial. */
export async function conReintentos<T>(f: () => Promise<T>, o: OpcionesReintento): Promise<T> {
  const dormir = o.dormir ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let ultimo: unknown;
  for (let i = 0; i < o.intentos; i++) {
    try {
      return await f();
    } catch (err) {
      ultimo = err;
      const recuperable = err instanceof JevError && ["rate_limited", "timeout", "unavailable"].includes(err.code);
      if (!recuperable || i === o.intentos - 1) throw err;
      const espera = Math.min(o.maxMs, (err as JevError).retryAfterMs ?? o.baseMs * 2 ** i);
      await dormir(espera);
    }
  }
  throw ultimo;
}
