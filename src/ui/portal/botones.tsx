"use client";

import { useState } from "react";
import { useListaLocal } from "./lista-local";
import s from "./portal.module.css";

export function BotonFavorito({ refInmueble, textos }: { refInmueble: string; textos: { guardar: string; quitar: string } }) {
  const { lista, alternar } = useListaLocal("favoritos");
  const activo = lista.includes(refInmueble);
  return (
    <button type="button" className={s.icono} aria-pressed={activo} aria-label={activo ? textos.quitar : textos.guardar} title={activo ? textos.quitar : textos.guardar} onClick={() => alternar(refInmueble)}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 21s-7.5-4.6-9.6-9.1C.8 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.9 3.9 4.3 7.4C19.5 16.4 12 21 12 21z" fill={activo ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </button>
  );
}

export function BotonComparar({ refInmueble, textos }: { refInmueble: string; textos: { comparar: string; quitar: string; maximo: string } }) {
  const { lista, alternar } = useListaLocal("comparar", 3);
  const [aviso, setAviso] = useState(false);
  const activo = lista.includes(refInmueble);
  return (
    <>
      <button
        type="button"
        className={s.enlaceBoton}
        aria-pressed={activo}
        onClick={() => {
          const ok = alternar(refInmueble);
          setAviso(!ok);
        }}
      >
        {activo ? textos.quitar : textos.comparar}
      </button>
      {aviso && (
        <span role="status" className={s.avisoPequeno}>
          {textos.maximo}
        </span>
      )}
    </>
  );
}

export function Compartir({ url, titulo, textos }: { url: string; titulo: string; textos: { compartir: string; copiado: string } }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className={s.enlaceBoton}
      onClick={async () => {
        const absoluta = new URL(url, window.location.origin).toString();
        if (navigator.share) {
          try {
            await navigator.share({ title: titulo, url: absoluta });
            return;
          } catch {
            /* cancelado: se copia */
          }
        }
        await navigator.clipboard?.writeText(absoluta);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }}
    >
      {textos.compartir}
      <span role="status" className="visually-hidden">
        {copiado ? textos.copiado : ""}
      </span>
      {copiado && <span aria-hidden="true"> · {textos.copiado}</span>}
    </button>
  );
}
