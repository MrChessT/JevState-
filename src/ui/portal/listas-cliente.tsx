"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import type { InmuebleFicha, InmuebleResumen } from "@/portal/tipos";
import { campo as campoCatalogo } from "@/catalog/publico";
import { ruta } from "@/i18n/config";
import { urlFicha } from "@/portal/urls";
import { EsqueletoTarjetas } from "@/ui/visual/esqueleto";
import { EstadoVacio } from "@/ui/visual/vacio";
import { EstadoVacioCliente } from "@/ui/visual/vacio-cliente";

const MEJOR: Record<string, "min" | "max"> = { precio: "min", superficie_construida: "max", superficie_util: "max", superficie_parcela: "max", habitaciones: "max", banos: "max", gastos_comunidad: "min", ibi: "min" };
import { CAMPOS_CARACTERISTICAS, CAMPOS_CLAVE, textoCampo } from "./campos";
import { euros } from "./formato";
import { useListaLocal } from "./lista-local";
import s from "./portal.module.css";
import { Tarjeta } from "./tarjeta";

type Carga<T> = { estado: "cargando" } | { estado: "error" } | { estado: "ok"; items: T[]; clave: string };

function useInmuebles<T extends { ref: string }>(refs: string[], fichas: boolean): { carga: Carga<T>; reintentar: () => void } {
  const [carga, setCarga] = useState<Carga<T>>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const clave = refs.join(",");
  useEffect(() => {
    let vivo = true;
    if (!clave) {
      queueMicrotask(() => vivo && setCarga({ estado: "ok", items: [], clave }));
      return;
    }
    queueMicrotask(() => vivo && setCarga({ estado: "cargando" }));
    fetch(`/api/inmuebles?refs=${encodeURIComponent(clave)}${fichas ? "&fichas=1" : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ items: T[] }>;
      })
      .then((r) => vivo && setCarga({ estado: "ok", items: r.items, clave }))
      .catch(() => vivo && setCarga({ estado: "error" }));
    return () => {
      vivo = false;
    };
  }, [clave, fichas, intento]);
  return { carga, reintentar: () => setIntento((n) => n + 1) };
}

/** Quita de la lista local las referencias que ya no están publicadas (vendidas o retiradas). */
function useLimpiarRetirados(refs: string[], carga: Carga<{ ref: string }>, quitar: (ref: string) => void) {
  useEffect(() => {
    // Solo con la respuesta de ESTA lista (no la de una lista anterior que aún se esté mostrando).
    if (carga.estado !== "ok" || carga.clave !== refs.join(",")) return;
    const vivas = new Set(carga.items.map((i) => i.ref));
    for (const r of refs) if (!vivas.has(r)) quitar(r);
  }, [carga, refs, quitar]);
}

function ErrorCarga({ locale, reintentar }: { locale: Locale; reintentar: () => void }) {
  const es = locale === "es";
  return (
    <EstadoVacioCliente icono="nube" titulo={es ? "No hemos podido cargar tus inmuebles" : "We couldn't load your properties"} texto={es ? "Comprueba tu conexión y vuelve a intentarlo. Tu lista sigue guardada en este navegador." : "Check your connection and try again. Your list is still saved in this browser."}>
      <button type="button" onClick={reintentar}>
        {es ? "Reintentar" : "Try again"}
      </button>
    </EstadoVacioCliente>
  );
}

export function ListaFavoritos({ locale, d }: { locale: Locale; d: Diccionario }) {
  const { lista, alternar } = useListaLocal("favoritos");
  const { carga, reintentar } = useInmuebles<InmuebleResumen>(lista, false);
  useLimpiarRetirados(lista, carga, alternar);
  if (carga.estado === "cargando") return <EsqueletoTarjetas n={Math.max(1, Math.min(lista.length, 6))} />;
  if (carga.estado === "error") return <ErrorCarga locale={locale} reintentar={reintentar} />;
  const items = carga.items;
  if (!items.length)
    return (
      <EstadoVacio
        icono="corazon"
        titulo={d.favoritos.vacioTitulo}
        texto={d.favoritos.vacio}
        acciones={[
          { texto: d.favoritos.verVenta, href: ruta(locale, "venta") },
          { texto: d.favoritos.preguntarAsistente, href: ruta(locale, "asistente") },
        ]}
      />
    );
  return (
    <div className={s.lista}>
      <h2 className="visually-hidden">{d.buscar.listaResultados}</h2>
      {items.map((i) => (
        <Tarjeta key={i.ref} i={i} locale={locale} d={d} />
      ))}
    </div>
  );
}

export function TablaComparar({ locale, d }: { locale: Locale; d: Diccionario }) {
  const { lista, alternar } = useListaLocal("comparar", 3);
  const { carga, reintentar } = useInmuebles<InmuebleFicha>(lista, true);
  useLimpiarRetirados(lista, carga, alternar);
  if (carga.estado === "cargando") return <div aria-busy="true" style={{ minHeight: "16rem" }} />;
  if (carga.estado === "error") return <ErrorCarga locale={locale} reintentar={reintentar} />;
  const items = carga.items;
  if (items.length < 2)
    return (
      <EstadoVacio
        icono="balanza"
        titulo={d.comparar.vacioTitulo}
        texto={d.comparar.vacio}
        acciones={[
          { texto: d.favoritos.verVenta, href: ruta(locale, "venta") },
          { texto: d.favoritos.preguntarAsistente, href: ruta(locale, "asistente") },
        ]}
      />
    );
  const filas = [...CAMPOS_CLAVE, ...CAMPOS_CARACTERISTICAS].filter((id) => id !== "tipo" && items.some((i) => textoCampo(id, i.campos[id], locale, d) !== null));
  const etiqueta = (id: string) => campoCatalogo(id)?.label[locale] ?? id.replace(/_/g, " ");
  // El mejor valor de cada fila numérica se resalta (solo con datos que constan).
  const mejor = (id: string): string | null => {
    const dir = MEJOR[id];
    if (!dir) return null;
    const vals = items.map((i) => ({ ref: i.ref, v: i.campos[id]?.value })).filter((x): x is { ref: string; v: number } => typeof x.v === "number" || (typeof x.v === "string" && x.v !== "" && !Number.isNaN(Number(x.v)))).map((x) => ({ ref: x.ref, v: Number(x.v) }));
    if (vals.length < 2) return null;
    const top = vals.reduce((a, b) => ((dir === "min" ? b.v < a.v : b.v > a.v) ? b : a));
    return vals.filter((x) => x.v === top.v).length === 1 ? top.ref : null;
  };
  return (
    <div className={s.desplazable}>
      <table className={s.tablaComparar}>
        <caption className="visually-hidden">{d.comparar.titulo}</caption>
        <thead>
          <tr>
            <th scope="col">{d.comparar.campo}</th>
            {items.map((i) => (
              <th key={i.ref} scope="col" className={s.compararCabecera}>
                {i.foto && (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura
                  <img src={i.foto} alt="" width={240} height={160} loading="lazy" />
                )}
                <a href={urlFicha(locale, i)}>{i.titulo}</a>
                <strong>{euros(locale, i.precio)}</strong>
                <button type="button" onClick={() => alternar(i.ref)}>
                  {d.tarjeta.quitarComparar}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((id) => {
            const m = mejor(id);
            return (
              <tr key={id}>
                <th scope="row">{etiqueta(id)}</th>
                {items.map((i) => {
                  const v = textoCampo(id, i.campos[id], locale, d);
                  const st = i.campos[id]?.status;
                  return (
                    <td key={i.ref} className={m === i.ref ? s.compararMejor : v === null ? s.compararNoConsta : undefined}>
                      {v === null ? `— ${d.confianza.no_consta.toLowerCase()}` : st === "probable" ? `${v} (${d.confianza.probable.toLowerCase()})` : v}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
