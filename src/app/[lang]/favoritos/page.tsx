import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import { FOTOS } from "@/config/imagenes";
import { Banner } from "@/ui/visual/banner";
import { ListaFavoritos } from "@/ui/portal/listas-cliente";

export async function generateMetadata({ params }: PageProps<"/[lang]/favoritos">): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  return { title: d.favoritos.titulo, robots: { index: false } };
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
