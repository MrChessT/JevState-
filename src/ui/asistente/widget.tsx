"use client";

// Botón flotante del asistente en todas las páginas (menos en la propia página del asistente).
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import s from "./asistente.module.css";
import { ChatAsistente, IconoChispa } from "./chat";

const ABIERTO = "asistente.abierto";
let abiertoMem: boolean | null = null;

function leerAbierto(): boolean {
  if (abiertoMem === null) {
    try {
      abiertoMem = sessionStorage.getItem(ABIERTO) === "1";
    } catch {
      abiertoMem = false;
    }
  }
  return abiertoMem;
}

function cambiar(v: boolean) {
  abiertoMem = v;
  try {
    sessionStorage.setItem(ABIERTO, v ? "1" : "0");
  } catch {
    // ignorado
  }
  window.dispatchEvent(new CustomEvent("asistente:abierto"));
}

function suscribir(cb: () => void) {
  window.addEventListener("asistente:abierto", cb);
  return () => window.removeEventListener("asistente:abierto", cb);
}

export function WidgetAsistente({ locale, textos }: { locale: Locale; textos: Diccionario["asistente"] & { hab: string; mes: string } }) {
  const pathname = usePathname();
  const abierto = useSyncExternalStore(suscribir, leerAbierto, () => false);
  const lanzador = useRef<HTMLButtonElement>(null);
  const estabaAbierto = useRef(abierto);
  // Al cerrar el panel, el foco vuelve al botón que lo abrió (WCAG 2.4.3).
  useEffect(() => {
    if (estabaAbierto.current && !abierto) lanzador.current?.focus();
    estabaAbierto.current = abierto;
  }, [abierto]);

  useEffect(() => {
    const abrir = () => cambiar(true);
    window.addEventListener("asistente:abrir", abrir);
    return () => window.removeEventListener("asistente:abrir", abrir);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && cambiar(false);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  if (/^\/(?:(?:es|en)\/)?(?:asistente|assistant)(?:\/|$)/.test(pathname ?? "")) return null;
  return abierto ? (
    <div className={s.panel} role="dialog" aria-modal="false" aria-label={textos.titulo}>
      <ChatAsistente locale={locale} textos={textos} variante="widget" alCerrar={() => cambiar(false)} />
    </div>
  ) : (
    <button ref={lanzador} type="button" className={s.lanzador} onClick={() => cambiar(true)} aria-label={textos.abrir}>
      <IconoChispa />
      <span>{textos.titulo}</span>
    </button>
  );
}
