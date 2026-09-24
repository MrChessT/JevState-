import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import { urlFicha } from "@/portal/filtros";
import type { InmuebleResumen } from "@/portal/tipos";
import { BotonComparar, BotonFavorito } from "./botones";
import { euros, numero } from "./formato";
import s from "./portal.module.css";

/** Tarjeta con «el porqué» en una línea; lo probable va marcado en naranja (sección 4.4). */
export function Tarjeta({ i, locale, d, prioridad }: { i: InmuebleResumen; locale: Locale; d: Diccionario; prioridad?: boolean }) {
  const precio = euros(locale, i.precio);
  const alquiler = i.operacion !== "venta";
  const m2 = i.precio && i.superficie && !alquiler ? numero(locale, Math.round(i.precio / i.superficie)) : null;
  const href = urlFicha(locale, i);
  const datos = [i.habitaciones ? t(d.tarjeta.hab, { n: i.habitaciones }) : null, i.superficie ? t(d.tarjeta.m2, { n: numero(locale, i.superficie) }) : null, i.banos ? t(d.tarjeta.banos, { n: i.banos }) : null, m2 ? t(d.tarjeta.eurM2, { n: m2 }) : null].filter(Boolean);
  return (
    <article className={s.tarjeta} data-ref={i.ref} id={`inmueble-${i.ref}`}>
      <Link href={href} className={s.tarjetaFoto} tabIndex={-1} aria-hidden="true">
        {i.foto && (
          // eslint-disable-next-line @next/next/no-img-element -- fotos de CDN externas y SVG ficticios; el CDN de imágenes llega con el Storage (fase 2b)
          <img src={i.foto} alt="" loading={prioridad ? "eager" : "lazy"} fetchPriority={prioridad ? "high" : "auto"} width={480} height={320} />
        )}
      </Link>
      <div className={s.tarjetaCuerpo}>
        <p className={s.precio}>
          {precio ?? d.tarjeta.consultar}
          {precio && alquiler && <span className={s.sufijo}>{d.tarjeta.mes}</span>}
          {i.precioAnterior && i.precio && i.precioAnterior > i.precio && <s className={s.antes}>{t(d.tarjeta.rebajado, { precio: euros(locale, i.precioAnterior)! })}</s>}
        </p>
        <h3 className={s.tarjetaTitulo}>
          <Link href={href}>{i.titulo}</Link>
        </h3>
        <p className={s.zona}>{i.zonaNombre === i.municipioNombre ? i.municipioNombre : `${i.zonaNombre}, ${i.municipioNombre}`}</p>
        {datos.length > 0 && <p className={s.porque}>{datos.join(" · ")}</p>}
        {i.rasgos.length > 0 && (
          <ul className={s.rasgos}>
            {i.rasgos.map((r) => {
              const nombre = d.rasgos[r.campo as keyof typeof d.rasgos] ?? r.campo;
              return (
                <li key={r.campo} className={r.status === "probable" ? s.rasgoProbable : undefined}>
                  {r.status === "probable" ? t(d.tarjeta.probable, { rasgo: nombre }) : nombre}
                </li>
              );
            })}
          </ul>
        )}
        <div className={s.tarjetaAcciones}>
          <BotonComparar refInmueble={i.ref} textos={{ comparar: d.tarjeta.comparar, quitar: d.tarjeta.quitarComparar, maximo: d.comparar.maximo }} />
          <BotonFavorito refInmueble={i.ref} textos={{ guardar: d.tarjeta.favorito, quitar: d.tarjeta.quitarFavorito }} />
        </div>
      </div>
    </article>
  );
}
