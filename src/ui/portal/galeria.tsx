"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./portal.module.css";

interface Textos {
  galeria: string;
  fotoDe: string;
  cerrar: string;
  anterior: string;
  siguiente: string;
}

/** Galería con lightbox accesible: <dialog> nativo, teclado (← → Esc) y foco gestionado. */
export function Galeria({ fotos, alt, textos }: { fotos: string[]; alt: string; textos: Textos }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [actual, setActual] = useState(0);
  const texto = (n: number) => textos.fotoDe.replace("{n}", String(n + 1)).replace("{total}", String(fotos.length));
  const abrir = (i: number) => {
    setActual(i);
    dialogo.current?.showModal();
  };
  const mover = useCallback((d: number) => setActual((a) => (a + d + fotos.length) % fotos.length), [fotos.length]);
  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    el.addEventListener("keydown", tecla);
    return () => el.removeEventListener("keydown", tecla);
  }, [mover]);
  if (!fotos.length) return null;
  return (
    <section aria-label={textos.galeria}>
      <div className={s.galeria}>
        {fotos.slice(0, 3).map((f, i) => (
          <button key={f} type="button" className={i === 0 ? s.galeriaPrincipal : undefined} onClick={() => abrir(i)} aria-label={`${textos.galeria}: ${texto(i)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ver Tarjeta */}
            <img src={f} alt={i === 0 ? alt : ""} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} width={960} height={640} />
          </button>
        ))}
      </div>
      <dialog ref={dialogo} className={s.lightbox} aria-label={textos.galeria}>
        <p aria-live="polite">{texto(actual)}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- ver Tarjeta */}
        <img src={fotos[actual]} alt={`${alt} · ${texto(actual)}`} />
        <div className={s.lightboxBotones}>
          <button type="button" onClick={() => mover(-1)}>
            ← {textos.anterior}
          </button>
          <button type="button" onClick={() => mover(1)}>
            {textos.siguiente} →
          </button>
          <form method="dialog">
            <button type="submit">{textos.cerrar}</button>
          </form>
        </div>
      </dialog>
    </section>
  );
}
