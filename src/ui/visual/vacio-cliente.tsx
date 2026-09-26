import type { ReactNode } from "react";
import s from "./visual.module.css";

const ICONOS = {
  aviso: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  nube: "M7 18a5 5 0 1 1 .6-10A6 6 0 0 1 19 9a4.5 4.5 0 0 1-.5 9H7z",
} as const;

/** Estado vacío o de error con acciones libres (botones o enlaces); válido en componentes cliente. */
export function EstadoVacioCliente({ icono, titulo, texto, children }: { icono: keyof typeof ICONOS; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className={s.vacio} role="alert">
      <span className={s.vacioIcono} aria-hidden="true">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONOS[icono]} />
        </svg>
      </span>
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {children && <div className={s.vacioAcciones}>{children}</div>}
    </div>
  );
}
