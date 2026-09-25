"use client";

import s from "./asistente.module.css";
import { IconoChispa } from "./chat";

/** Abre el widget del asistente (en la ficha: el asistente ya sabe qué inmueble se está viendo). */
export function BotonAbrirAsistente({ texto }: { texto: string }) {
  return (
    <button type="button" className={s.abrirAsistente} onClick={() => window.dispatchEvent(new CustomEvent("asistente:abrir"))}>
      <IconoChispa />
      {texto}
    </button>
  );
}
