import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { FOTOS } from "@/config/imagenes";
import { Banner } from "@/ui/visual/banner";
import { ListaFavoritos } from "@/ui/portal/listas-cliente";

export async function generateMetadata({ params }: PageProps<"/[lang]/favoritos">): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  const alt = alternativas(BRAND.siteUrl, "favoritos");
  const l = isLocale(lang) ? lang : "es";
  return { title: d.favoritos.titulo, description: t(d.meta.favoritos), alternates: { canonical: alt[LOCALE_TAGS[l].intl], languages: alt }, robots: { index: false } };
}

export default async function Pagina({ params }: PageProps<"/[lang]/favoritos">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  return (
    <>
      <Banner foto={FOTOS.salon} credito={d.inicio.fotoCredito} titulo={d.favoritos.titulo} texto={d.favoritos.local} />
      <div className="contenedor" style={{ paddingBlock: "var(--e-7) 0" }}>
        <ListaFavoritos locale={lang} d={d} />
      </div>
    </>
  );
}
