import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { portal } from "@/portal/datos";
import { leerFiltros } from "@/portal/filtros";
import { colindantes, zona, ZONAS } from "@/zonas/buscar";
import { FOTO_ZONA, FOTOS } from "@/config/imagenes";
import { Banner } from "@/ui/visual/banner";
import { RangoPrecio } from "@/ui/visual/rango";
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
  const foto = FOTO_ZONA[z.municipio] ?? FOTOS.costa;
  const e = (x: string | null) => (x ? numero(lang, x) : null);
  return (
    <>
      <Banner
        foto={foto}
        credito={d.inicio.fotoCredito}
        antetitulo={z.nivel === "barrio" ? zona(z.municipio)?.nombre : d.zonas.antetitulo}
        titulo={t(d.zonas.tituloZona, { zona: z.nombre })}
        texto={t(d.zonas.textoZona, { zona: z.nombre })}
        cifras={[
          { etiqueta: d.inicio.cifras.venta, valor: numero(lang, venta.total) },
          { etiqueta: d.inicio.cifras.alquiler, valor: numero(lang, alquiler.total) },
          ...(est.medianaM2 ? [{ etiqueta: d.zonas.cifraMedianaZona, valor: t(d.zonas.mediana, { m2: e(est.medianaM2)! }) }] : []),
        ]}
        acciones={
          <>
            <Link href={ruta(lang, "venta", ...path)}>{d.buscar.tituloVenta}</Link>
            <Link href={ruta(lang, "alquiler", ...path)}>{d.buscar.tituloAlquiler}</Link>
          </>
        }
      />
    <div className={`contenedor ${s.pagina}`} style={{ display: "grid", gap: "var(--e-6)" }}>
      {est.medianaM2 && est.p25M2 && est.p75M2 && est.n >= 3 && (
        <section aria-labelledby="precios" style={{ maxWidth: "44rem" }}>
          <h2 id="precios">{d.zonas.barrasTitulo}</h2>
          <RangoPrecio
            valor={Number(est.medianaM2)}
            p25={Number(est.p25M2)}
            p75={Number(est.p75M2)}
            mediana={Number(est.medianaM2)}
            etiquetaValor={t(d.zonas.mediana, { m2: e(est.medianaM2)! })}
            textos={{ barato: d.zonas.barato, caro: d.zonas.caro, descripcion: t(d.zonas.rangoTexto, { zona: z.nombre, p25: e(est.p25M2)!, p75: e(est.p75M2)!, mediana: e(est.medianaM2)! }) }}
          />
        </section>
      )}
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
    </>
  );
}
