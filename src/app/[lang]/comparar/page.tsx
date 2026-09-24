import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
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
    <div className="contenedor" style={{ paddingBlock: "var(--e-6)", display: "grid", gap: "var(--e-4)" }}>
      <h1>{d.comparar.titulo}</h1>
      
      <TablaComparar locale={lang} d={d} />
    </div>
  );
}
