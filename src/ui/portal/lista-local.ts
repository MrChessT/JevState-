"use client";

import { useCallback, useSyncExternalStore } from "react";

// Favoritos y comparador sin cuenta: se guardan en este navegador (localStorage), con un evento para
// que todas las tarjetas se actualicen a la vez. La cuenta los sincronizará (fase 3-5).
const EVENTO = "inmo:lista-local";

function leer(clave: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const cache = new Map<string, { raw: string; lista: string[] }>();
function instantanea(clave: string): string[] {
  let raw = "[]";
  try {
    raw = localStorage.getItem(clave) ?? "[]";
  } catch {
    /* almacenamiento bloqueado */
  }
  const c = cache.get(clave);
  if (c && c.raw === raw) return c.lista;
  const lista = leer(clave);
  cache.set(clave, { raw, lista });
  return lista;
}

const VACIA: string[] = [];

export function useListaLocal(clave: "favoritos" | "comparar", maximo = 200) {
  const lista = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENTO, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENTO, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => instantanea(clave),
    () => VACIA,
  );
  const alternar = useCallback(
    (ref: string): boolean => {
      const actual = leer(clave);
      const siguiente = actual.includes(ref) ? actual.filter((x) => x !== ref) : actual.length >= maximo ? null : [...actual, ref];
      if (!siguiente) return false;
      try {
        localStorage.setItem(clave, JSON.stringify(siguiente));
      } catch {
        return false;
      }
      window.dispatchEvent(new Event(EVENTO));
      return true;
    },
    [clave, maximo],
  );
  const vaciar = useCallback(() => {
    try {
      localStorage.setItem(clave, "[]");
    } catch {
      return;
    }
    window.dispatchEvent(new Event(EVENTO));
  }, [clave]);
  return { lista, alternar, vaciar };
}
