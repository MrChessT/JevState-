"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { LOCALE_NAMES, LOCALES, resolverRuta, ruta, type Locale } from "@/i18n/config";
import s from "./layout.module.css";

/**
 * Cambio de idioma con enlaces reales (ES · EN) a la misma página traducida: funcionan sin
 * JavaScript, se pueden abrir en otra pestaña y los buscadores los siguen.
 */
export function SelectorIdioma({ locale, etiqueta }: { locale: Locale; etiqueta: string }) {
  const pathname = usePathname();
  const r = resolverRuta(pathname ?? "/");
  const partes = r.tipo === "reescribir" ? r.destino.split("/").filter(Boolean).slice(1) : [];
  return (
    <nav aria-label={etiqueta} className={s.segmentado}>
      {LOCALES.map((l) => (
        <Link key={l} href={ruta(l, ...partes)} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined} title={LOCALE_NAMES[l]}>
          <span aria-hidden="true">{l.toUpperCase()}</span>
          <span className="visually-hidden">{LOCALE_NAMES[l]}</span>
        </Link>
      ))}
    </nav>
  );
}

type Tema = "sistema" | "claro" | "oscuro";
const CLAVE = "tema";
const EVENTO = "tema:cambio";

function leerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "claro" || v === "oscuro" ? v : "sistema";
  } catch {
    return "sistema";
  }
}

function aplicar(tema: Tema) {
  const html = document.documentElement;
  if (tema === "sistema") delete html.dataset.theme;
  else html.dataset.theme = tema === "claro" ? "light" : "dark";
}

function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}

const ICONOS: Record<Tema, string> = {
  claro: "M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  oscuro: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  sistema: "M4 5h16v11H4zM9 20h6M12 16v4",
};

/**
 * Claro / oscuro / automático. La preferencia se guarda en este navegador y se vuelve a aplicar
 * cada vez que se monta la cabecera (también al cambiar de idioma, que cambia el <html>).
 */
export function SelectorTema({ textos }: { textos: { tema: string; claro: string; oscuro: string; sistema: string } }) {
  const tema = useSyncExternalStore(suscribir, leerTema, () => "sistema" as Tema);
  useLayoutEffect(() => aplicar(tema), [tema]);
  const cambiar = (nuevo: Tema) => {
    try {
      if (nuevo === "sistema") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, nuevo);
    } catch {
      // Navegación privada o almacenamiento bloqueado: se aplica igualmente en esta visita.
    }
    aplicar(nuevo);
    window.dispatchEvent(new Event(EVENTO));
  };
  return (
    <div role="group" aria-label={textos.tema} className={s.segmentado}>
      {(["claro", "oscuro", "sistema"] as const).map((t) => (
        <button key={t} type="button" aria-pressed={tema === t} onClick={() => cambiar(t)} title={textos[t]} aria-label={textos[t]}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICONOS[t]} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** Script en línea que aplica el tema guardado antes de pintar (sin parpadeo en la primera carga). */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CLAVE}');if(t==='claro')document.documentElement.dataset.theme='light';else if(t==='oscuro')document.documentElement.dataset.theme='dark';}catch(e){}})();`;
