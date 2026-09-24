import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { portal } from "@/portal/datos";
import { leerFiltros } from "@/portal/filtros";
import { colindantes, zona, ZONAS } from "@/zonas/buscar";
import { BotonEnlace } from "@/ui/componentes";
import { numero } from "@/ui/portal/formato";
import s from "@/ui/portal/portal.module.css";
import { Tarjeta } from "@/ui/portal/tarjeta";

export async function generateMetadata({ params }: PageProps<"/[lang]/zonas/[...path]">): Promise<Metadata> {
  const { lang, path } = await params;
  const z = zona(path.join("/"));
  if (!isLocale(lang) || !z) return {};
  const d = await diccionario(lang);
  const alt = alternativas(BRAND.siteUrl, "zonas", ...path);
  return { title: t(d.zonas.tituloZona, { zona: z.nombre }), description: t(d.zonas.textoZona, { zona: z.nombre }), alternates: { canonical: alt[LOCALE_TAGS[lang].intl], languages: alt } };
}

export default async function ZonaPagina({ params }: PageProps<"/[lang]/zonas/[...path]">) {
  const { lang, path } = await params;
  const z = zona(path.join("/"));
  if (!isLocale(lang) || !z) notFound();
  const d = await diccionario(lang);
  const repo = await portal();
  const [venta, alquiler, est] = await Promise.all([repo.buscar(leerFiltros("venta", path, {})), repo.buscar(leerFiltros("alquiler", path, {})), repo.estadistica(z.path, "venta")]);
  const barrios = z.nivel === "municipio" ? ZONAS.filter((x) => x.nivel === "barrio" && x.municipio === z.municipio) : [];
  const vecinos = colindantes(z.municipio).map((p) => zona(p)!).filter(Boolean);
  return (
    <div className={`contenedor ${s.pagina}`} style={{ display: "grid", gap: "var(--e-5)" }}>
      <header>
        <h1>{t(d.zonas.tituloZona, { zona: z.nombre })}</h1>
        <p>{t(d.zonas.textoZona, { zona: z.nombre })}</p>
        <p>
          {t(d.zonas.enVenta, { n: venta.total })} · {t(d.zonas.enAlquiler, { n: alquiler.total })}
          {est.medianaM2 && <> · {t(d.zonas.medianaVenta, { m2: numero(lang, est.medianaM2) })}</>}
        </p>
        <div style={{ display: "flex", gap: "var(--e-3)", flexWrap: "wrap" }}>
          <BotonEnlace href={ruta(lang, "venta", ...path)}>{d.buscar.tituloVenta}</BotonEnlace>
          <BotonEnlace href={ruta(lang, "alquiler", ...path)} variante="secundario">
            {d.buscar.tituloAlquiler}
          </BotonEnlace>
        </div>
      </header>
      {venta.items.length > 0 && (
        <div className={s.lista}>
          {venta.items.slice(0, 6).map((i) => (
            <Tarjeta key={i.ref} i={i} locale={lang} d={d} />
          ))}
        </div>
      )}
      {barrios.length > 0 && (
        <section aria-labelledby="barrios">
          <h2 id="barrios">{d.zonas.barrios}</h2>
          <ul className={s.zonas}>
            {barrios.map((b) => (
              <li key={b.path}>
                <Link href={ruta(lang, "zonas", ...b.path.split("/"))}>
                  <strong>{b.nombre}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {vecinos.length > 0 && (
        <section aria-labelledby="vecinos">
          <h2 id="vecinos">{d.zonas.colindantes}</h2>
          <ul className={s.zonas}>
            {vecinos.map((v) => (
              <li key={v.path}>
                <Link href={ruta(lang, "zonas", v.path)}>
                  <strong>{v.nombre}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
