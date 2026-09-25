import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import { urlFicha } from "@/portal/filtros";
import type { InmuebleResumen } from "@/portal/tipos";
import { BotonComparar, BotonFavorito } from "./botones";
import { euros, numero } from "./formato";
import s from "./portal.module.css";

const MAX_RASGOS = 3;
const DIAS_NUEVO = 10;

/** Publicado hace pocos días (la página se regenera cada 10 minutos: basta con esa precisión). */
function esNuevo(publicadoEn: string): boolean {
  return (Date.now() - Date.parse(publicadoEn)) / 86_400_000 <= DIAS_NUEVO;
}

const Icono = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONO_HAB = "M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 18v2M21 18v2M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3";
const ICONO_BANO = "M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2";
const ICONO_M2 = "M4 4h16v16H4zM4 9h5M15 4v5M4 15h5M15 20v-5";

/**
 * Tarjeta de inmueble con estructura fija: foto con distintivos, precio, título (2 líneas), zona
 * (1 línea), datos con iconos, rasgos (1 fila) y pie con acciones siempre abajo. Así, en una
 * rejilla, todos los textos quedan a la misma altura. Lo probable va marcado (sección 4.4).
 */
export function Tarjeta({ i, locale, d, prioridad }: { i: InmuebleResumen; locale: Locale; d: Diccionario; prioridad?: boolean }) {
  const precio = euros(locale, i.precio);
  const alquiler = i.operacion !== "venta";
  const m2 = i.precio && i.superficie && !alquiler ? numero(locale, Math.round(i.precio / i.superficie)) : null;
  const href = urlFicha(locale, i);
  const bajada = i.precioAnterior && i.precio && i.precioAnterior > i.precio ? Math.round(((i.precioAnterior - i.precio) / i.precioAnterior) * 100) : null;
  const nuevo = esNuevo(i.publicadoEn);
  const rasgos = i.rasgos.slice(0, MAX_RASGOS);
  const resto = i.rasgos.length - rasgos.length;
  const tipo = i.tipo ? (d.tipos[i.tipo as keyof typeof d.tipos] ?? i.tipo) : null;
  return (
    <article className={s.tarjeta} data-ref={i.ref} id={`inmueble-${i.ref}`}>
      <div className={s.tarjetaFoto}>
        <Link href={href} tabIndex={-1} aria-hidden="true">
          {i.foto && (
            // eslint-disable-next-line @next/next/no-img-element -- fotos de CDN externas y SVG ficticios; el CDN de imágenes llega con el Storage
            <img src={i.foto} alt="" loading={prioridad ? "eager" : "lazy"} fetchPriority={prioridad ? "high" : "auto"} width={480} height={360} />
          )}
        </Link>
        <div className={s.distintivos}>
          {tipo && <span>{tipo}</span>}
          {nuevo && <span className={s.distintivoNuevo}>{d.tarjeta.nuevo}</span>}
          {bajada && <span className={s.distintivoBajada}>{t(d.tarjeta.bajada, { pct: bajada })}</span>}
        </div>
        <div className={s.fotoFavorito}>
          <BotonFavorito refInmueble={i.ref} textos={{ guardar: d.tarjeta.favorito, quitar: d.tarjeta.quitarFavorito }} />
        </div>
      </div>
      <div className={s.tarjetaCuerpo}>
        <p className={s.precio}>
          <span>
            {precio ?? d.tarjeta.consultar}
            {precio && alquiler && <span className={s.sufijo}>{d.tarjeta.mes}</span>}
          </span>
          {bajada && i.precioAnterior && <s className={s.antes}>{euros(locale, i.precioAnterior)}</s>}
        </p>
        <h3 className={s.tarjetaTitulo}>
          <Link href={href}>{i.titulo}</Link>
        </h3>
        <p className={s.zona}>{i.zonaNombre === i.municipioNombre ? i.municipioNombre : `${i.zonaNombre}, ${i.municipioNombre}`}</p>
        <ul className={s.datos}>
          <li>
            <Icono d={ICONO_HAB} />
            {i.habitaciones ?? "—"}
            <span className="visually-hidden"> {t(d.tarjeta.hab, { n: "" })}</span>
          </li>
          <li>
            <Icono d={ICONO_BANO} />
            {i.banos ?? "—"}
            <span className="visually-hidden"> {t(d.tarjeta.banos, { n: "" })}</span>
          </li>
          <li>
            <Icono d={ICONO_M2} />
            {i.superficie ? t(d.tarjeta.m2, { n: numero(locale, i.superficie) }) : "—"}
          </li>
        </ul>
        <ul className={s.rasgos}>
          {rasgos.map((r) => {
            const nombre = d.rasgos[r.campo as keyof typeof d.rasgos] ?? r.campo;
            return (
              <li key={r.campo} className={r.status === "probable" ? s.rasgoProbable : undefined}>
                {r.status === "probable" ? t(d.tarjeta.probable, { rasgo: nombre }) : nombre}
              </li>
            );
          })}
          {resto > 0 && <li className={s.rasgoMas}>{t(d.tarjeta.mas, { n: resto })}</li>}
        </ul>
        <div className={s.tarjetaAcciones}>
          <span className={s.eurM2}>{m2 ? t(d.tarjeta.eurM2, { n: m2 }) : " "}</span>
          <BotonComparar refInmueble={i.ref} textos={{ comparar: d.tarjeta.comparar, quitar: d.tarjeta.quitarComparar, maximo: d.comparar.maximo }} />
        </div>
      </div>
    </article>
  );
}
