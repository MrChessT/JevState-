"use client";

import { Suspense, useCallback, useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fechaMinima, FRANJAS, type Franja } from "@/crm/solicitud";
import type { Diccionario } from "@/i18n/diccionario";
import s from "./portal.module.css";

type Textos = Diccionario["formContacto"];
type Estado = { fase: "editando" } | { fase: "enviando" } | { fase: "enviado"; nombre: string; visita: boolean } | { fase: "error"; mensaje: string };
type CampoError = "nombre" | "email" | "telefono" | "fecha" | "consentimiento";

const rellenar = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/**
 * Formulario de contacto o de visita de la ficha. Se puede prellenar desde la URL
 * (`?campo=…`, `?visita=1&fecha=…&franja=…&mensaje=…`): así llegan los borradores del
 * asistente y las preguntas de «no consta». Nada se envía sin pulsar «Enviar».
 */
export function FormularioContacto({ refInmueble, locale, textos, privacidadHref, etiquetasCampo }: { refInmueble: string; locale: "es" | "en"; textos: Textos; privacidadHref: string; etiquetasCampo: Record<string, string> }) {
  const id = useId();
  const [tipo, setTipo] = useState<"contacto" | "visita" | "pregunta_no_consta">("contacto");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mensaje, setMensaje] = useState(() => rellenar(textos.mensajeInicial, { ref: refInmueble }));
  const [fecha, setFecha] = useState("");
  const [franja, setFranja] = useState<Franja>("indiferente");
  const [campo, setCampo] = useState<string | undefined>();
  const [consentimiento, setConsentimiento] = useState(false);
  const [web, setWeb] = useState("");
  const [origen, setOrigen] = useState<"formulario" | "asistente">("formulario");
  const [errores, setErrores] = useState<Partial<Record<CampoError, string>>>({});
  const [estado, setEstado] = useState<Estado>({ fase: "editando" });
  const [minimo, setMinimo] = useState("");

  // Prellenado desde la URL: la lee <LectorConsulta> (en Suspense, porque la ficha es estática).
  const aplicar = useCallback(
    (q: URLSearchParams) => {
      setMinimo(fechaMinima());
      const c = q.get("campo");
      if (c && /^[a-z_,]{1,300}$/.test(c)) {
        setCampo(c);
        setTipo("pregunta_no_consta");
        const nombres = c.split(",").map((x) => etiquetasCampo[x] ?? x.replace(/_/g, " "));
        setMensaje(rellenar(textos.mensajeCampo, { ref: refInmueble, campos: nombres.join(", ").toLowerCase() }));
      }
      if (q.get("visita") === "1") setTipo("visita");
      const f = q.get("fecha");
      if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) setFecha(f < fechaMinima() ? "" : f);
      const fr = q.get("franja");
      if (fr && (FRANJAS as readonly string[]).includes(fr)) setFranja(fr as Franja);
      const m = q.get("mensaje");
      if (m) setMensaje(m.slice(0, 1500));
      if (q.get("origen") === "asistente") setOrigen("asistente");
    },
    [etiquetasCampo, refInmueble, textos.mensajeCampo],
  );

  function validar(): Partial<Record<CampoError, string>> {
    const e: Partial<Record<CampoError, string>> = {};
    if (nombre.trim().length < 2) e.nombre = textos.errores.nombre;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    const telOk = /^\+?[\d\s().-]{9,20}$/.test(telefono.trim());
    if (email.trim() && !emailOk) e.email = textos.errores.email;
    if (telefono.trim() && !telOk) e.telefono = textos.errores.telefono;
    if (!email.trim() && !telefono.trim()) e.email = textos.errores.email;
    if (tipo === "visita" && fecha && fecha < fechaMinima()) e.fecha = textos.errores.fecha;
    if (!consentimiento) e.consentimiento = textos.errores.consentimiento;
    return e;
  }

  async function enviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const e = validar();
    setErrores(e);
    const primero = (Object.keys(e) as CampoError[])[0];
    if (primero) {
      document.getElementById(`${id}-${primero}`)?.focus();
      return;
    }
    setEstado({ fase: "enviando" });
    try {
      const r = await fetch("/api/contacto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo, ref: refInmueble, nombre, email: email.trim(), telefono: telefono.trim(), mensaje, fecha: tipo === "visita" ? fecha : "", franja, campo, consentimiento: true, locale, origen, web }),
      });
      if (r.ok) {
        setEstado({ fase: "enviado", nombre: nombre.trim().split(/\s+/)[0] ?? "", visita: tipo === "visita" });
        return;
      }
      setEstado({ fase: "error", mensaje: r.status === 429 ? textos.errores.limite : textos.errores.general });
    } catch {
      setEstado({ fase: "error", mensaje: textos.errores.general });
    }
  }

  if (estado.fase === "enviado") {
    return (
      <div className={s.contactoOk} role="status" data-contacto="enviado">
        <p className={s.contactoOkTitulo}>{textos.enviadoTitulo}</p>
        <p>{rellenar(textos.enviadoTexto, { nombre: estado.nombre })}</p>
        {estado.visita && <p className={s.nota}>{textos.enviadoVisita}</p>}
        <button type="button" className={s.enlaceBoton} onClick={() => setEstado({ fase: "editando" })}>
          {textos.otra}
        </button>
      </div>
    );
  }

  const err = (c: CampoError) =>
    errores[c] ? (
      <span className={s.campoError} id={`${id}-${c}-error`}>
        {errores[c]}
      </span>
    ) : null;
  const aria = (c: CampoError) => ({ id: `${id}-${c}`, "aria-invalid": errores[c] ? true : undefined, "aria-describedby": errores[c] ? `${id}-${c}-error` : undefined });

  return (
    <form className={s.contactoForm} onSubmit={enviar} noValidate aria-busy={estado.fase === "enviando"}>
      <Suspense fallback={null}>
        <LectorConsulta alCambiar={aplicar} />
      </Suspense>
      {origen === "asistente" && <p className={s.contactoBorrador}>{textos.borrador}</p>}
      {tipo !== "pregunta_no_consta" && (
        <fieldset className={s.contactoTipo}>
          <legend>{textos.tipo}</legend>
          {(["contacto", "visita"] as const).map((x) => (
            <label key={x} data-activo={tipo === x || undefined}>
              <input type="radio" name={`${id}-tipo`} value={x} checked={tipo === x} onChange={() => setTipo(x)} />
              {x === "contacto" ? textos.tipoContacto : textos.tipoVisita}
            </label>
          ))}
        </fieldset>
      )}
      <label className={s.contactoCampo}>
        {textos.nombre}
        <input {...aria("nombre")} name="nombre" autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
        {err("nombre")}
      </label>
      <div className={s.contactoDos}>
        <label className={s.contactoCampo}>
          {textos.email}
          <input {...aria("email")} name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} />
          {err("email")}
        </label>
        <label className={s.contactoCampo}>
          {textos.telefono}
          <input {...aria("telefono")} name="telefono" type="tel" autoComplete="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20} />
          {err("telefono")}
        </label>
      </div>
      <p className={s.nota}>{textos.medioAyuda}</p>
      {tipo === "visita" && (
        <div className={s.contactoDos}>
          <label className={s.contactoCampo}>
            {textos.fecha}
            <input {...aria("fecha")} name="fecha" type="date" min={minimo || undefined} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            {err("fecha")}
          </label>
          <label className={s.contactoCampo}>
            {textos.franja}
            <select name="franja" value={franja} onChange={(e) => setFranja(e.target.value as Franja)}>
              {FRANJAS.map((f) => (
                <option key={f} value={f}>
                  {textos.franjas[f]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className={s.contactoCampo}>
        {textos.mensaje}
        <textarea name="mensaje" rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={1500} />
      </label>
      {/* Trampa para bots: invisible y fuera del orden de tabulación. */}
      <div className={s.trampa} aria-hidden="true">
        <label>
          Web
          <input name="web" tabIndex={-1} autoComplete="off" value={web} onChange={(e) => setWeb(e.target.value)} />
        </label>
      </div>
      <label className={s.contactoConsentimiento}>
        <input {...aria("consentimiento")} type="checkbox" name="consentimiento" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} />
        <span>
          {textos.consentimiento}{" "}
          <a href={privacidadHref} target="_blank" rel="noopener">
            {textos.privacidad}
          </a>
          .
        </span>
      </label>
      {err("consentimiento")}
      {estado.fase === "error" && (
        <p className={s.campoError} role="alert">
          {estado.mensaje}
        </p>
      )}
      <button type="submit" className={s.contactoEnviar} disabled={estado.fase === "enviando"}>
        {estado.fase === "enviando" ? textos.enviando : textos.enviar}
      </button>
    </form>
  );
}

/** Aplica la consulta de la URL al formulario cada vez que cambia (también al navegar desde el asistente). */
function LectorConsulta({ alCambiar }: { alCambiar: (q: URLSearchParams) => void }) {
  const q = useSearchParams();
  const clave = q.toString();
  useEffect(() => {
    alCambiar(new URLSearchParams(clave));
  }, [clave, alCambiar]);
  return null;
}
