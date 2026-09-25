import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import { FOTOS } from "@/config/imagenes";
import { Banner } from "@/ui/visual/banner";
import { TablaComparar } from "@/ui/portal/listas-cliente";

export async function generateMetadata({ params }: PageProps<"/[lang]/comparar">): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  return { title: d.comparar.titulo, robots: { index: false } };
}

export default async function Pagina({ params }: PageProps<"/[lang]/comparar">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  return (
    <>
      <Banner foto={FOTOS.frenteMar} credito={d.inicio.fotoCredito} titulo={d.comparar.titulo} texto={undefined} />
      <div className="contenedor" style={{ paddingBlock: "var(--e-7) 0" }}>
        <TablaComparar locale={lang} d={d} />
      </div>
    </>
  );
}
