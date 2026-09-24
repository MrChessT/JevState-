"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCALE_NAMES, LOCALES, resolverRuta, ruta, type Locale } from "@/i18n/config";
import s from "./layout.module.css";

/** Cambia de idioma manteniendo la página (con sus segmentos traducidos). */
export function SelectorIdioma({ locale, etiqueta }: { locale: Locale; etiqueta: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const cambiar = (destino: Locale) => {
    const r = resolverRuta(pathname);
    const partes = r.tipo === "reescribir" ? r.destino.split("/").filter(Boolean).slice(1) : [];
    router.push(ruta(destino, ...partes));
  };
  return (
    <label>
      <span className="visually-hidden">{etiqueta}</span>
      <select className={s.selector} value={locale} onChange={(e) => cambiar(e.target.value as Locale)} lang={locale}>
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

type Tema = "sistema" | "claro" | "oscuro";
const CLAVE = "tema";

function aplicar(tema: Tema) {
  const html = document.documentElement;
  if (tema === "sistema") delete html.dataset.theme;
  else html.dataset.theme = tema === "claro" ? "light" : "dark";
}

function temaGuardado(): Tema {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "claro" || v === "oscuro" ? v : "sistema";
  } catch {
    return "sistema";
  }
}

/** Claro / oscuro / automático. La preferencia se guarda solo en este navegador. */
export function SelectorTema({ textos }: { textos: { tema: string; claro: string; oscuro: string; sistema: string } }) {
  const [tema, setTema] = useState<Tema>("sistema");
  useEffect(() => {
    // Sincroniza el control con lo que aplicó el script inicial (localStorage no existe en el servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(temaGuardado());
  }, []);
  const cambiar = (nuevo: Tema) => {
    setTema(nuevo);
    aplicar(nuevo);
    try {
      if (nuevo === "sistema") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, nuevo);
    } catch {
      // Navegación privada o almacenamiento bloqueado: el tema se aplica igualmente en esta visita.
    }
  };
  return (
    <label>
      <span className="visually-hidden">{textos.tema}</span>
      <select className={s.selector} value={tema} onChange={(e) => cambiar(e.target.value as Tema)}>
        <option value="sistema">{textos.sistema}</option>
        <option value="claro">{textos.claro}</option>
        <option value="oscuro">{textos.oscuro}</option>
      </select>
    </label>
  );
}

/** Script en línea que aplica el tema guardado antes de pintar (sin parpadeo). */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CLAVE}');if(t==='claro')document.documentElement.dataset.theme='light';else if(t==='oscuro')document.documentElement.dataset.theme='dark';}catch(e){}})();`;
