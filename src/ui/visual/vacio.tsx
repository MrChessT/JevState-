import Link from "next/link";
import s from "./visual.module.css";

const ICONOS = {
  corazon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  balanza: "M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0L5 7zM19 7l-3 7a4 4 0 0 0 6 0l-3-7zM8 21h8",
  lupa: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
} as const;

/** Estado vacío con icono, texto y acciones (nunca una página en blanco). */
export function EstadoVacio({ icono, titulo, texto, acciones }: { icono: keyof typeof ICONOS; titulo: string; texto: string; acciones: Array<{ texto: string; href: string }> }) {
  return (
    <div className={s.vacio}>
      <span className={s.vacioIcono} aria-hidden="true">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONOS[icono]} />
        </svg>
      </span>
      <h2>{titulo}</h2>
      <p>{texto}</p>
      <div className={s.vacioAcciones}>
        {acciones.map((a) => (
          <Link key={a.href} href={a.href}>
            {a.texto}
          </Link>
        ))}
      </div>
    </div>
  );
}
