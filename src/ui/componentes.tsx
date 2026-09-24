import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import s from "./ui.module.css";

type Variante = "primario" | "acento" | "secundario" | "fantasma";

function clases(...c: Array<string | false | undefined>): string {
  return c.filter(Boolean).join(" ");
}

export function Boton({ variante = "primario", pequeno, className, ...props }: ComponentProps<"button"> & { variante?: Variante; pequeno?: boolean }) {
  return <button className={clases(s.boton, s[variante], pequeno && s.pequeno, className)} {...props} />;
}

export function BotonEnlace({ variante = "primario", pequeno, className, ...props }: ComponentProps<typeof Link> & { variante?: Variante; pequeno?: boolean }) {
  return <Link className={clases(s.boton, s[variante], pequeno && s.pequeno, className)} {...props} />;
}

export function Chip({ activo, dudoso, className, ...props }: ComponentProps<"button"> & { activo?: boolean; dudoso?: boolean }) {
  return <button type="button" aria-pressed={activo} className={clases(s.chip, dudoso && s.chipDudoso, className)} {...props} />;
}

export type EstadoCampo = "confirmado" | "probable" | "no_consta" | "revisar";

const ICONO: Record<EstadoCampo, string> = { confirmado: "✓", probable: "≈", no_consta: "–", revisar: "!" };

/** Estado de un dato del inmueble. El texto siempre se lee (también con lector de pantalla). */
export function EtiquetaConfianza({ estado, texto, titulo }: { estado: EstadoCampo; texto: string; titulo?: string }) {
  return (
    <span className={clases(s.etiqueta, s[estado])} title={titulo}>
      <span aria-hidden="true">{ICONO[estado]}</span>
      {texto}
    </span>
  );
}

export function Tarjeta({ className, ...props }: ComponentProps<"div">) {
  return <div className={clases(s.tarjeta, className)} {...props} />;
}

export function Aviso({ tipo = "info", children, role }: { tipo?: "info" | "ok" | "error" | "dudoso"; children: ReactNode; role?: "status" | "alert" }) {
  const cls = { info: s.avisoInfo, ok: s.avisoOk, error: s.avisoError, dudoso: s.avisoDudoso }[tipo];
  return (
    <div className={clases(s.aviso, cls)} role={role}>
      {children}
    </div>
  );
}

export function CampoTexto({ id, etiqueta, error, ayuda, ...input }: ComponentProps<"input"> & { id: string; etiqueta: string; error?: string; ayuda?: string }) {
  const describedBy = [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={s.campo}>
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {ayuda && (
        <span id={`${id}-ayuda`} className={s.ayuda}>
          {ayuda}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={s.errorCampo} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
