"use client";

import { useActionState } from "react";
import { Aviso, Boton, CampoTexto } from "@/ui/componentes";
import { enviarEnlace, type EstadoEnlace } from "./acciones";

interface Textos {
  email: string;
  enviar: string;
  enviando: string;
  enviado: string;
  emailNoValido: string;
  error: string;
  noConfigurada: string;
}

export function FormularioEnlace({ lang, textos }: { lang: string; textos: Textos }) {
  const [estado, accion, pendiente] = useActionState<EstadoEnlace, FormData>(enviarEnlace, { estado: "inicial" });
  if (estado.estado === "enviado") {
    return (
      <Aviso tipo="ok" role="status">
        <p>{textos.enviado}</p>
      </Aviso>
    );
  }
  return (
    <form action={accion} style={{ display: "grid", gap: "var(--e-4)" }} noValidate>
      <input type="hidden" name="lang" value={lang} />
      <CampoTexto
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        etiqueta={textos.email}
        error={estado.estado === "email_no_valido" ? textos.emailNoValido : undefined}
      />
      {estado.estado === "error" && (
        <Aviso tipo="error" role="alert">
          <p>{textos.error}</p>
        </Aviso>
      )}
      {estado.estado === "no_configurada" && (
        <Aviso tipo="dudoso" role="alert">
          <p>{textos.noConfigurada}</p>
        </Aviso>
      )}
      <div>
        <Boton type="submit" disabled={pendiente} aria-disabled={pendiente}>
          {pendiente ? textos.enviando : textos.enviar}
        </Boton>
      </div>
    </form>
  );
}
