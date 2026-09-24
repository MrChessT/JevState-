import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, type Locale } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { portal } from "@/portal/datos";
import { esSlugFicha, leerFiltros, tieneFiltros, urlFicha } from "@/portal/filtros";
import { zona } from "@/zonas/buscar";
import { Ficha } from "./ficha";
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
    const i = await (await portal()).ficha(operacion, slug);
    if (!i) return {};
    const url = urlFicha(lang, i);
    const alt = Object.fromEntries((["es", "en"] as Locale[]).map((l) => [LOCALE_TAGS[l].intl, `${BRAND.siteUrl}${urlFicha(l, i)}`]));
    return { title: i.titulo, description: i.descripcion.slice(0, 155), alternates: { canonical: `${BRAND.siteUrl}${url}`, languages: alt }, openGraph: { title: i.titulo, images: i.fotos.slice(0, 1), type: "website" } };
  }
  const f = leerFiltros(operacion, z, await searchParams);
  const base = operacion === "venta" ? d.buscar.tituloVenta : d.buscar.tituloAlquiler;
  const nz = nombreZona(z);
  const titulo = nz ? `${base} ${t(d.buscar.en, { zona: nz })}` : base;
  const alt = alternativas(BRAND.siteUrl, operacion, ...z);
  // Las combinaciones de filtros no se indexan: la canónica es la de operación + zona.
  return { title: titulo, alternates: { canonical: alt[LOCALE_TAGS[lang].intl], languages: alt }, ...(tieneFiltros(f) ? { robots: { index: false, follow: true } } : {}) };
}

export async function PaginaOperacion({ operacion, props }: { operacion: "venta" | "alquiler"; props: Props }) {
  const { lang, ruta: segs } = await props.params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const repo = await portal();
  const { zona: z, slug } = partes(segs);
  if (z.length && !zona(z.join("/"))) notFound();
  if (slug) {
    const i = await repo.ficha(operacion, slug);
    if (!i || (z.length && z.join("/") !== i.zonaPath)) notFound();
    const [est, similares] = await Promise.all([repo.estadistica(i.zonaPath.split("/")[0]!, operacion), repo.similares(i)]);
    return <Ficha i={i} zona={est} similares={similares} locale={lang} d={d} />;
  }
  const f = leerFiltros(operacion, z, await props.searchParams);
  const r = await repo.buscar(f);
  const nz = nombreZona(z);
  const base = operacion === "venta" ? d.buscar.tituloVenta : d.buscar.tituloAlquiler;
  return <Resultados f={f} r={r} titulo={nz ? `${base} ${t(d.buscar.en, { zona: nz })}` : base} locale={lang} d={d} />;
}
