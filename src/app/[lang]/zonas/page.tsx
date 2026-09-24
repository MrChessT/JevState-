import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { portal } from "@/portal/datos";
import { ZONAS } from "@/zonas/buscar";
import s from "@/ui/portal/portal.module.css";

// Datos del portal: se regeneran cada 10 minutos (ISR).
export const revalidate = 600;

export async function generateMetadata({ params }: PageProps<"/[lang]/zonas">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const d = await diccionario(lang);
  const alt = alternativas(BRAND.siteUrl, "zonas");
  return { title: d.zonas.titulo, description: d.zonas.intro, alternates: { canonical: alt[LOCALE_TAGS[lang].intl], languages: alt } };
}

export default async function Zonas({ params }: PageProps<"/[lang]/zonas">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const todas = await (await portal()).todas();
  const municipios = ZONAS.filter((z) => z.nivel === "municipio")
    .map((z) => ({ z, venta: todas.filter((i) => i.operacion === "venta" && i.zonaPath.split("/")[0] === z.path).length, alquiler: todas.filter((i) => i.operacion !== "venta" && i.zonaPath.split("/")[0] === z.path).length }))
    .sort((a, b) => b.venta + b.alquiler - (a.venta + a.alquiler) || a.z.nombre.localeCompare(b.z.nombre, "es"));
  return (
    <div className={`contenedor ${s.pagina}`}>
      <h1>{d.zonas.titulo}</h1>
      <p>{d.zonas.intro}</p>
      <ul className={s.zonas}>
        {municipios.map(({ z, venta, alquiler }) => (
          <li key={z.path}>
            <Link href={ruta(lang, "zonas", z.path)}>
              <strong>{z.nombre}</strong>
              <small>
                {t(d.zonas.enVenta, { n: venta })} · {t(d.zonas.enAlquiler, { n: alquiler })}
              </small>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
