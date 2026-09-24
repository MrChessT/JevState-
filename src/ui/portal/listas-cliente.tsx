"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import type { InmuebleFicha, InmuebleResumen } from "@/portal/tipos";
import { Aviso } from "@/ui/componentes";
import { CAMPOS_CARACTERISTICAS, CAMPOS_CLAVE, textoCampo } from "./campos";
import { euros } from "./formato";
import { useListaLocal } from "./lista-local";
import s from "./portal.module.css";
import { Tarjeta } from "./tarjeta";

function useInmuebles<T>(refs: string[], fichas: boolean): T[] | null {
  const [items, setItems] = useState<T[] | null>(null);
  const clave = refs.join(",");
  useEffect(() => {
    let vivo = true;
    if (!clave) {
      queueMicrotask(() => vivo && setItems([]));
      return;
    }
    fetch(`/api/inmuebles?refs=${encodeURIComponent(clave)}${fichas ? "&fichas=1" : ""}`)
      .then((r) => r.json() as Promise<{ items: T[] }>)
      .then((r) => vivo && setItems(r.items))
      .catch(() => vivo && setItems([]));
    return () => {
      vivo = false;
    };
  }, [clave, fichas]);
  return items;
}

export function ListaFavoritos({ locale, d }: { locale: Locale; d: Diccionario }) {
  const { lista } = useListaLocal("favoritos");
  const items = useInmuebles<InmuebleResumen>(lista, false);
  if (items === null) return null;
  if (!items.length)
    return (
      <Aviso tipo="info">
        <p>{d.favoritos.vacio}</p>
      </Aviso>
    );
  return (
    <div className={s.lista}>
      {items.map((i) => (
        <Tarjeta key={i.ref} i={i} locale={locale} d={d} />
      ))}
    </div>
  );
}

export function TablaComparar({ locale, d }: { locale: Locale; d: Diccionario }) {
  const { lista } = useListaLocal("comparar", 3);
  const items = useInmuebles<InmuebleFicha>(lista, true);
  if (items === null) return null;
  if (items.length < 2)
    return (
      <Aviso tipo="info">
        <p>{d.comparar.vacio}</p>
      </Aviso>
    );
  const filas = [...CAMPOS_CLAVE, ...CAMPOS_CARACTERISTICAS].filter((id) => items.some((i) => textoCampo(id, i.campos[id], locale, d) !== null));
  const etiqueta = (id: string) => (d.rasgos as Record<string, string>)[id] ?? id.replace(/_/g, " ");
  return (
    <div className={s.desplazable}>
      <table className={s.tablaComparar}>
        <caption className="visually-hidden">{d.comparar.titulo}</caption>
        <thead>
          <tr>
            <th scope="col">{d.comparar.campo}</th>
            {items.map((i) => (
              <th key={i.ref} scope="col">
                {i.titulo}
                <br />
                <small>{euros(locale, i.precio)}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((id) => (
            <tr key={id}>
              <th scope="row">{etiqueta(id)}</th>
              {items.map((i) => {
                const v = textoCampo(id, i.campos[id], locale, d);
                const st = i.campos[id]?.status;
                return <td key={i.ref}>{v === null ? `— ${d.confianza.no_consta.toLowerCase()}` : st === "probable" ? `${v} (${d.confianza.probable.toLowerCase()})` : v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
