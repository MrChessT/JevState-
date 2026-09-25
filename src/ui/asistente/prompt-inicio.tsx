"use client";

// Buscador de la portada: lo que se escribe aquí abre la página del asistente con el mensaje.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import s from "./asistente.module.css";
import { IconoChispa } from "./chat";

export function PromptInicio({ destino, textos }: { destino: string; textos: { etiqueta: string; placeholder: string; boton: string; ejemplos: readonly string[] } }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const ir = (m: string) => router.push(`${destino}?q=${encodeURIComponent(m.trim().slice(0, 500))}`);
  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    if (texto.trim()) ir(texto);
  };
  return (
    <div className={s.prompt}>
      <form className={s.promptCaja} onSubmit={alEnviar} action={destino} method="get">
        <span className={s.promptIcono} aria-hidden="true">
          <IconoChispa />
        </span>
        <label className="visually-hidden" htmlFor="prompt-inicio">
          {textos.etiqueta}
        </label>
        <input id="prompt-inicio" name="q" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={textos.placeholder} maxLength={500} autoComplete="off" />
        <button type="submit" className={s.promptBoton}>
          {textos.boton}
        </button>
      </form>
      <ul className={s.promptEjemplos}>
        {textos.ejemplos.slice(0, 3).map((ej) => (
          <li key={ej}>
            <button type="button" onClick={() => ir(ej)}>
              {ej}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
