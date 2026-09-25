"use client";

// Conversación con el asistente (widget flotante y página /asistente). El estado de la búsqueda
// viaja con cada mensaje; la conversación se guarda en sessionStorage para que sobreviva a la
// navegación entre páginas (y se pierde al cerrar la pestaña).
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import type { EstadoAsistente, RespuestaAsistente, TarjetaAsistente } from "@/asistente/motor";
import type { Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import { BotonFavorito } from "@/ui/portal/botones";
import { euros, numero } from "@/ui/portal/formato";
import s from "./asistente.module.css";

type Textos = Diccionario["asistente"] & { hab: string; mes: string };
type Fase = keyof Textos["fases"];

type Mensaje = { id: string; rol: "usuario"; texto: string } | { id: string; rol: "asistente"; r: RespuestaAsistente } | { id: string; rol: "error"; texto: string };

interface Guardado {
  estado: EstadoAsistente | null;
  mensajes: Mensaje[];
}

const CLAVE = "asistente.v1";
const MAX_MENSAJES = 40;
const VACIO: Guardado = { estado: null, mensajes: [] };

// Almacén externo (useSyncExternalStore): memoria del módulo como fuente de verdad y
// sessionStorage como copia, para que sobreviva a la navegación y funcione aunque esté bloqueado.
let memoria: Guardado | null = null;

function leer(): Guardado {
  if (!memoria) {
    try {
      const raw = sessionStorage.getItem(CLAVE);
      memoria = raw ? (JSON.parse(raw) as Guardado) : VACIO;
    } catch {
      memoria = VACIO;
    }
  }
  return memoria;
}

function guardar(g: Guardado) {
  memoria = { ...g, mensajes: g.mensajes.slice(-MAX_MENSAJES) };
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(memoria));
  } catch {
    // sin almacenamiento (modo privado, bloqueado): conversación solo en memoria
  }
  window.dispatchEvent(new CustomEvent("asistente:cambio"));
}

function suscribir(cb: () => void) {
  window.addEventListener("asistente:cambio", cb);
  return () => window.removeEventListener("asistente:cambio", cb);
}

const rellenar = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const nuevoId = () => Math.random().toString(36).slice(2, 10);

async function leerSSE(res: Response, alEvento: (evento: string, datos: unknown) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let corte: number;
    while ((corte = buffer.indexOf("\n\n")) >= 0) {
      const bloque = buffer.slice(0, corte);
      buffer = buffer.slice(corte + 2);
      const evento = /^event: (.*)$/m.exec(bloque)?.[1] ?? "message";
      const datos = /^data: (.*)$/m.exec(bloque)?.[1];
      if (datos) alEvento(evento, JSON.parse(datos));
    }
  }
}

export function ChatAsistente({ locale, textos, variante, alCerrar }: { locale: Locale; textos: Textos; variante: "widget" | "pagina"; alCerrar?: () => void }) {
  const g = useSyncExternalStore(suscribir, leer, () => VACIO);
  const [texto, setTexto] = useState("");
  const [fase, setFase] = useState<Fase | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const abortar = useRef<AbortController | null>(null);
  const idEntrada = useId();

  useEffect(() => () => abortar.current?.abort(), []);

  // Con una respuesta nueva se lleva al principio de esa respuesta (el texto antes que las
  // tarjetas); mientras piensa, al final.
  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    const ultimo = el.lastElementChild as HTMLElement | null;
    const top = !fase && ultimo && g.mensajes.at(-1)?.rol === "asistente" ? ultimo.offsetTop - 12 : el.scrollHeight;
    el.scrollTo({ top, behavior: "smooth" });
  }, [g.mensajes, fase]);

  const enviar = useCallback(
    async (cuerpo: { mensaje?: string; opcion?: string; quitar?: string; accion?: RespuestaAsistente["sugerencias"][number]["accion"] }, eco?: string) => {
      if (fase) return;
      const actual = leer();
      const mensajes: Mensaje[] = eco ? [...actual.mensajes, { id: nuevoId(), rol: "usuario", texto: eco }] : actual.mensajes;
      const base = { ...actual, mensajes };
      guardar(base);
      setFase("entendiendo");
      const viendo = document.querySelector<HTMLElement>("[data-inmueble-viendo]")?.dataset.inmuebleViendo;
      abortar.current = new AbortController();
      let respuesta: RespuestaAsistente | null = null;
      let error: string | null = null;
      try {
        const res = await fetch("/api/asistente", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ ...cuerpo, locale, viendo, estado: actual.estado ?? undefined }),
          signal: abortar.current.signal,
        });
        if (res.status === 429) {
          const j = (await res.json().catch(() => ({}))) as { espera?: number };
          error = rellenar(textos.demasiadas, { s: j.espera ?? 30 });
        } else if (!res.ok || !res.body) error = textos.error;
        else
          await leerSSE(res, (evento, datos) => {
            if (evento === "fase") setFase((datos as { fase: Fase }).fase);
            else if (evento === "respuesta") respuesta = datos as RespuestaAsistente;
            else if (evento === "error") error = textos.error;
          });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        error = textos.error;
      } finally {
        setFase(null);
      }
      const r = respuesta as RespuestaAsistente | null;
      const final: Guardado = r
        ? { estado: r.estado, mensajes: [...mensajes, { id: nuevoId(), rol: "asistente", r }] }
        : { ...base, mensajes: [...mensajes, { id: nuevoId(), rol: "error", texto: error ?? textos.error }] };
      guardar(final);
    },
    [fase, locale, textos],
  );

  // La portada abre esta página con ?q=mensaje: se envía una vez y se limpia la URL.
  const inicial = useRef(false);
  useEffect(() => {
    if (variante !== "pagina" || inicial.current) return;
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q")?.trim().slice(0, 1000);
    if (!q) return;
    const id = window.setTimeout(() => {
      inicial.current = true;
      url.searchParams.delete("q");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      void enviar({ mensaje: q }, q);
    }, 0);
    return () => window.clearTimeout(id);
  }, [variante, enviar]);

  const alEnviar = (e?: FormEvent) => {
    e?.preventDefault();
    const m = texto.trim();
    if (!m || fase) return;
    setTexto("");
    void enviar({ mensaje: m }, m);
  };

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      alEnviar();
    }
  };

  const reiniciar = () => {
    abortar.current?.abort();
    const vacio = VACIO;
    guardar(vacio);
    entrada.current?.focus();
  };

  const ultima = [...g.mensajes].reverse().find((m): m is Extract<Mensaje, { rol: "asistente" }> => m.rol === "asistente");
  const chips = ultima?.r.chips ?? [];
  const degradado = ultima?.r.degradado ?? false;

  return (
    <section className={`${s.chat} ${variante === "widget" ? s.chatWidget : s.chatPagina}`} aria-label={textos.titulo}>
      <header className={s.chatCabecera}>
        <div className={s.chatTitulo}>
          <span className={s.avatar} aria-hidden="true">
            <IconoChispa />
          </span>
          <div>
            <strong>{textos.titulo}</strong>
            {degradado ? (
              <span className={s.estadoDegradado} title={textos.degradadoAyuda}>
                {textos.degradado}
              </span>
            ) : (
              <span className={s.estadoOk}>{textos.promesas[0]}</span>
            )}
          </div>
        </div>
        <div className={s.chatAcciones}>
          {g.mensajes.length > 0 && (
            <button type="button" className={s.iconoBoton} onClick={reiniciar} title={textos.nueva} aria-label={textos.nueva}>
              <IconoNuevo />
            </button>
          )}
          {variante === "widget" && (
            <>
              <Link className={s.iconoBoton} href={locale === "es" ? "/asistente" : "/en/assistant"} title={textos.ampliar} aria-label={textos.ampliar}>
                <IconoAmpliar />
              </Link>
              <button type="button" className={s.iconoBoton} onClick={alCerrar} title={textos.cerrar} aria-label={textos.cerrar}>
                <IconoCerrar />
              </button>
            </>
          )}
        </div>
      </header>

      {chips.length > 0 && (
        <div className={s.ficha} aria-label={textos.tuBusqueda} role="group">
          <span className={s.fichaTitulo}>{textos.tuBusqueda}</span>
          <ul className={s.fichaChips}>
            {chips.map((c) => (
              <li key={c.clave}>
                <span className={`${s.chipFicha} ${c.dudoso ? s.chipDudoso : ""}`} title={c.dudoso ? textos.dudoso : undefined}>
                  {c.texto}
                  <button type="button" onClick={() => void enviar({ quitar: c.clave })} aria-label={rellenar(textos.quitar, { texto: c.texto })} disabled={Boolean(fase)}>
                    <IconoCerrar />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={s.mensajes} ref={lista} aria-live="polite" aria-busy={Boolean(fase)}>
        {g.mensajes.length === 0 && (
          <div className={s.bienvenida}>
            {variante === "widget" && <p className={s.bienvenidaTitulo}>{textos.tituloLargo}</p>}
            <p className={s.bienvenidaTexto}>{textos.subtitulo}</p>
            <p className={s.ejemplosTitulo}>{textos.ejemplosTitulo}</p>
            <ul className={s.ejemplos}>
              {textos.ejemplos.map((ej) => (
                <li key={ej}>
                  <button type="button" onClick={() => void enviar({ mensaje: ej }, ej)}>
                    {ej}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {g.mensajes.map((m, idx) =>
          m.rol === "usuario" ? (
            <div key={m.id} className={s.usuario}>
              <span className="visually-hidden">{textos.tu}: </span>
              {m.texto}
            </div>
          ) : m.rol === "error" ? (
            <div key={m.id} className={s.error} role="alert">
              {m.texto}
            </div>
          ) : (
            <Respuesta key={m.id} r={m.r} locale={locale} textos={textos} variante={variante} activa={idx === g.mensajes.length - 1 && !fase} alElegir={(valor, texto) => void enviar({ opcion: valor }, texto)} alDescartar={(ref) => void enviar({ mensaje: `${locale === "es" ? "No me encaja" : "Not for me"}: ${ref}` }, `${textos.noEncaja}: ${ref}`)} alAccion={(accion, texto) => void enviar({ accion }, texto)} />
          ),
        )}
        {fase && (
          <div className={s.pensando} role="status">
            <span className={s.puntos} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {textos.fases[fase]}
          </div>
        )}
      </div>

      <form className={s.formulario} onSubmit={alEnviar}>
        <label htmlFor={idEntrada} className="visually-hidden">
          {textos.placeholder}
        </label>
        <textarea
          id={idEntrada}
          ref={entrada}
          rows={1}
          value={texto}
          maxLength={1000}
          placeholder={textos.placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
          autoFocus={variante === "widget"}
        />
        <button type="submit" className={s.enviar} disabled={!texto.trim() || Boolean(fase)} aria-label={textos.enviar}>
          <IconoEnviar />
        </button>
      </form>
      <p className={s.privacidad}>{textos.privacidad}</p>
    </section>
  );
}

type Accion = RespuestaAsistente["sugerencias"][number]["accion"];

function Respuesta({ r, locale, textos, variante, activa, alElegir, alDescartar, alAccion }: { r: RespuestaAsistente; locale: Locale; textos: Textos; variante: "widget" | "pagina"; activa: boolean; alElegir: (valor: string, texto: string) => void; alDescartar: (ref: string) => void; alAccion: (a: Accion, texto: string) => void }) {
  return (
    <div className={s.respuesta}>
      {r.parrafos.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {r.cifras.length > 0 && (
        <dl className={s.cifras}>
          {r.cifras.map((c) => (
            <div key={c.etiqueta}>
              <dt>{c.etiqueta}</dt>
              <dd>{c.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {r.opciones.length > 0 && (
        <div className={s.opciones}>
          {r.opciones.map((o) => (
            <button key={o.valor} type="button" className={s.opcion} onClick={() => alElegir(o.valor, o.texto)} disabled={!activa}>
              {o.texto}
            </button>
          ))}
        </div>
      )}
      {r.tabla && (
        <div className={s.tablaContenedor}>
          <table className={s.tabla}>
            <thead>
              <tr>
                <th scope="col">{textos.campo}</th>
                {r.tabla.columnas.map((c) => (
                  <th key={c.ref} scope="col">
                    <Link href={c.href}>{c.ref}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.tabla.filas.map((f) => (
                <tr key={f.campo}>
                  <th scope="row">{f.campo}</th>
                  {f.valores.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.tarjetas.length > 0 && (
        <ul className={variante === "widget" ? s.carrusel : s.rejilla}>
          {r.tarjetas.map((t) => (
            <li key={t.i.ref}>
              <MiniTarjeta t={t} locale={locale} textos={textos} alDescartar={activa ? alDescartar : undefined} alCuota={(ref) => alAccion({ tipo: "hipoteca", ref, anos: 30, entradaPct: 20 }, `${textos.cuota}: ${ref}`)} />
            </li>
          ))}
        </ul>
      )}
      {r.enlaces.length > 0 && (
        <ul className={s.enlaces}>
          {r.enlaces.map((e) => (
            <li key={e.href}>
              <Link href={e.href}>{e.texto} →</Link>
            </li>
          ))}
        </ul>
      )}
      {activa && r.sugerencias.length > 0 && (
        <div className={s.sugerencias} role="group" aria-label={textos.siguientes}>
          {r.sugerencias.map((x) => (
            <button key={x.texto} type="button" onClick={() => alAccion(x.accion, x.texto)}>
              {x.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ICONO_PORQUE = { bueno: "✓", probable: "≈", aviso: "!", neutro: "·" } as const;

function MiniTarjeta({ t, locale, textos, alDescartar, alCuota }: { t: TarjetaAsistente; locale: Locale; textos: Textos; alDescartar?: (ref: string) => void; alCuota: (ref: string) => void }) {
  const i = t.i;
  const alquiler = i.operacion !== "venta";
  const datos = [i.habitaciones ? rellenar(textos.hab, { n: i.habitaciones }) : null, i.superficie ? `${numero(locale, i.superficie)} m²` : null, i.zonaNombre].filter(Boolean).join(" · ");
  return (
    <article className={s.mini}>
      <Link href={t.href} className={s.miniFoto} tabIndex={-1} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- miniaturas pequeñas; las ficticias son SVG */}
        {i.foto && <img src={i.foto} alt="" loading="lazy" width={320} height={200} />}
        <span className={s.miniRef}>{i.ref}</span>
      </Link>
      <div className={s.miniFavorito}>
        <BotonFavorito refInmueble={i.ref} textos={{ guardar: textos.guardar, quitar: textos.quitarGuardado }} />
      </div>
      <div className={s.miniCuerpo}>
        <p className={s.miniPrecio}>
          {euros(locale, i.precio) ?? "—"}
          {alquiler && <small>{textos.mes}</small>}
        </p>
        <h3 className={s.miniTitulo}>
          <Link href={t.href}>{i.titulo}</Link>
        </h3>
        <p className={s.miniDatos}>{datos}</p>
        {t.porque.length > 0 && (
          <ul className={s.porque}>
            {t.porque.map((p) => (
              <li key={p.texto} data-tipo={p.tipo}>
                <span aria-hidden="true">{ICONO_PORQUE[p.tipo]}</span>
                {p.texto}
              </li>
            ))}
          </ul>
        )}
        <div className={s.miniAcciones}>
          <Link href={t.href} className={s.miniVer}>
            {textos.verFicha}
          </Link>
          {!alquiler && i.precio && (
            <button type="button" className={s.miniDescartar} onClick={() => alCuota(i.ref)}>
              {textos.cuota}
            </button>
          )}
          {alDescartar && (
            <button type="button" className={s.miniDescartar} onClick={() => alDescartar(i.ref)}>
              {textos.noEncaja}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// Iconos (trazos de 1,75 px, 20×20) ------------------------------------------------------------

const svg = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const IconoChispa = () => (
  <svg {...svg}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
  </svg>
);
const IconoCerrar = () => (
  <svg {...svg}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const IconoEnviar = () => (
  <svg {...svg}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconoNuevo = () => (
  <svg {...svg}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);
const IconoAmpliar = () => (
  <svg {...svg}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);
