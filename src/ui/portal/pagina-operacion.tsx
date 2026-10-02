import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, ruta, type Locale } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { buscarUnaVez, fichaUnaVez, portal } from "@/portal/datos";
import { esSlugFicha, leerFiltros, tieneFiltros, urlFicha } from "@/portal/filtros";
import { zona } from "@/zonas/buscar";
import { imagenSitio, JsonLd, listaInmuebles, migas } from "@/ui/seo/jsonld";
import { conMarca } from "@/ui/seo/titulo";
import { Ficha } from "./ficha";
import { euros } from "./formato";
import s from "./portal.module.css";
import { Resultados } from "./resultados";

type Props = { params: Promise<{ lang: string; ruta?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function partes(rutaSegs: string[] | undefined) {
  const segs = rutaSegs ?? [];
  const ultimo = segs[segs.length - 1];
  return esSlugFicha(ultimo) ? { zona: segs.slice(0, -1), slug: ultimo! } : { zona: segs, slug: null };
}

function nombreZona(segs: string[]): string | null {
  return segs.length ? (zona(segs.join("/"))?.nombre ?? null) : null;
}

export async function metadataOperacion(operacion: "venta" | "alquiler", { params, searchParams }: Props): Promise<Metadata> {
  const { lang, ruta: segs } = await params;
  if (!isLocale(lang)) return {};
  const d = await diccionario(lang);
  const { zona: z, slug } = partes(segs);
  if (slug) {
    const i = await fichaUnaVez(operacion, slug);
    if (!i) return {};
    const url = urlFicha(lang, i);
    const alt = Object.fromEntries((["es", "en"] as Locale[]).map((l) => [LOCALE_TAGS[l].intl, `${BRAND.siteUrl}${urlFicha(l, i)}`]));
    const precio = euros(lang, i.precio);
    const titulo = `${i.titulo}${precio ? ` · ${precio}${i.operacion === "venta" ? "" : d.tarjeta.mes}` : ""}`;
    const descripcion = i.descripcion.replace(/\s+/g, " ").slice(0, 155).replace(/\s\S*$/, "…");
    const og = `${BRAND.siteUrl}/api/og/inmueble/${encodeURIComponent(i.ref)}?lang=${lang}`;
    return {
      title: { absolute: conMarca(titulo) },
      description: descripcion,
      alternates: { canonical: `${BRAND.siteUrl}${url}`, languages: { ...alt, "x-default": alt[LOCALE_TAGS.es.intl]! } },
      openGraph: { title: titulo, description: descripcion, url: `${BRAND.siteUrl}${url}`, images: [{ url: og, width: 1200, height: 630, alt: i.titulo }], type: "website" },
      twitter: { card: "summary_large_image", title: titulo, description: descripcion, images: [og] },
    };
  }
  const f = leerFiltros(operacion, z, await searchParams);
  const base = operacion === "venta" ? d.buscar.tituloVenta : d.buscar.tituloAlquiler;
  const nz = nombreZona(z);
  const titulo = nz ? `${base} ${t(d.buscar.en, { zona: nz })}` : base;
  const alt = alternativas(BRAND.siteUrl, operacion, ...z);
  const r = await buscarUnaVez(f);
  const precios = r.items.map((x) => x.precio).filter((x): x is number => x !== null);
  const descripcion = r.total
    ? t(d.buscar.metaDescripcion, { n: r.total, operacion: operacion === "venta" ? d.buscar.metaVenta : d.buscar.metaAlquiler, donde: nz ? t(d.buscar.en, { zona: nz }) : d.buscar.metaRegion, desde: euros(lang, Math.min(...(precios.length ? precios : [0]))) ?? "" })
    : undefined;
  // Las combinaciones de filtros no se indexan: la canónica es la de operación + zona. Las páginas
  // 2, 3… sin otros filtros sí: cada una con su canónica, su hreflang y su título (Google lo pide así).
  const soloPagina = f.pagina > 1 && !tieneFiltros({ ...f, pagina: 1 });
  const altP = soloPagina ? Object.fromEntries(Object.entries(alt).map(([k, v]) => [k, `${v}?pagina=${f.pagina}`])) : alt;
  const tituloP = f.pagina > 1 ? `${titulo} · ${t(d.buscar.paginaN, { n: f.pagina })}` : titulo;
  const noIndexar = (tieneFiltros(f) && !soloPagina) || r.total === 0;
  return { title: tituloP, description: descripcion, alternates: { canonical: altP[LOCALE_TAGS[lang].intl], languages: altP }, openGraph: { title: tituloP, description: descripcion, url: altP[LOCALE_TAGS[lang].intl], images: imagenSitio(lang) }, ...(noIndexar ? { robots: { index: false, follow: true } } : {}) };
}

export async function PaginaOperacion({ operacion, props }: { operacion: "venta" | "alquiler"; props: Props }) {
  const { lang, ruta: segs } = await props.params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const repo = await portal();
  const { zona: z, slug } = partes(segs);
  if (z.length && !zona(z.join("/"))) notFound();
  if (slug) {
    const i = await fichaUnaVez(operacion, slug);
    if (!i || (z.length && z.join("/") !== i.zonaPath)) notFound();
    const [est, similares] = await Promise.all([repo.estadistica(i.zonaPath.split("/")[0]!, operacion), repo.similares(i)]);
    return <Ficha i={i} zona={est} similares={similares} locale={lang} d={d} />;
  }
  const f = leerFiltros(operacion, z, await props.searchParams);
  const r = await buscarUnaVez(f);
  const nz = nombreZona(z);
  const base = operacion === "venta" ? d.buscar.tituloVenta : d.buscar.tituloAlquiler;
  const rastro = [{ nombre: d.buscar.inicio, href: ruta(lang) }, { nombre: base, href: ruta(lang, operacion) }, ...z.map((_, k) => ({ nombre: zona(z.slice(0, k + 1).join("/"))?.nombre ?? z[k]!, href: ruta(lang, operacion, ...z.slice(0, k + 1)) }))];
  return (
    <>
      <JsonLd grafo={[migas(rastro), listaInmuebles(r.items.map((i) => urlFicha(lang, i)))]} />
      <Resultados f={f} r={r} titulo={nz ? `${base} ${t(d.buscar.en, { zona: nz })}` : base} locale={lang} d={d} />
      <section className={`contenedor ${s.confianzaListado}`} aria-labelledby="como-trabajamos">
        <h2 id="como-trabajamos">{d.inicio.promesasTitulo}</h2>
        <ul>
          {d.inicio.promesas.map((x) => (
            <li key={x.titulo}>
              <strong>{x.titulo}.</strong> {x.texto}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
