import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import { FOTOS, urlFoto } from "@/config/imagenes";
import s from "@/ui/asistente/asistente.module.css";
import { ChatAsistente } from "@/ui/asistente/chat";

export async function generateMetadata({ params }: PageProps<"/[lang]/asistente">): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  return { title: d.asistente.titulo, description: d.asistente.subtitulo };
}

export default async function Pagina({ params }: PageProps<"/[lang]/asistente">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  return (
    <div className={`contenedor ${s.pagina}`}>
      <header className={s.paginaCabecera}>
        <span className={s.paginaFoto} style={{ backgroundImage: `url(${urlFoto(FOTOS.salon, 1600)})` }} aria-hidden="true" />
        <h1>{d.asistente.tituloLargo}</h1>
        <p>{d.asistente.subtitulo}</p>
        <ul className={s.promesas}>
          {d.asistente.promesas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </header>
      <ChatAsistente locale={lang} textos={{ ...d.asistente, hab: d.tarjeta.hab, mes: d.tarjeta.mes }} variante="pagina" />
    </div>
  );
}
