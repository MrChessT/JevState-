import Link from "next/link";
import { lang as rootLang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, ruta } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";

export default async function NoEncontrado() {
  // not-found no recibe params: el idioma sale del parámetro raíz (sin forzar render dinámico).
  const valor = await rootLang();
  const lang = isLocale(valor) ? valor : DEFAULT_LOCALE;
  const d = await diccionario(lang);
  return (
    <div className="contenedor texto-largo" style={{ paddingBlock: "var(--e-8)" }}>
      <h1>{d.error404.titulo}</h1>
      <p>{d.error404.texto}</p>
      <Link href={ruta(lang)}>{d.error404.volver}</Link>
    </div>
  );
}
