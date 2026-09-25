import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, LOCALES } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { textoSobre } from "@/ui/color";
import { Cabecera } from "@/ui/layout/cabecera";
import { Pie } from "@/ui/layout/pie";
import { SCRIPT_TEMA } from "@/ui/layout/selectores";
import { WidgetAsistente } from "@/ui/asistente/widget";
import { INDEXABLE, publicada } from "@/config/secciones";
import { fuenteTexto, fuenteTitulos } from "@/ui/fuentes";
import "../globals.css";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const d = await diccionario(lang);
  return {
    metadataBase: new URL(BRAND.siteUrl),
    title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
    description: t(d.meta.descripcion),
    alternates: { canonical: alternativas(BRAND.siteUrl)[LOCALE_TAGS[lang].intl], languages: alternativas(BRAND.siteUrl) },
    openGraph: { siteName: BRAND.name, locale: LOCALE_TAGS[lang].og, type: "website" },
    robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#121412" },
  ],
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const marca = {
    "--marca": BRAND.primaryColor,
    "--marca-texto": textoSobre(BRAND.primaryColor),
    "--acento": BRAND.accentColor,
    "--acento-texto": textoSobre(BRAND.accentColor),
  } as CSSProperties;
  return (
    <html lang={lang} style={marca} className={`${fuenteTexto.variable} ${fuenteTitulos.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <a className="saltar" href="#contenido">
          {d.nav.saltar}
        </a>
        <Cabecera locale={lang} d={d} />
        <main id="contenido" tabIndex={-1}>
          {children}
        </main>
        <Pie locale={lang} d={d} ficticios={process.env.NEXT_PUBLIC_DATOS_FICTICIOS === "true"} />
        {publicada("asistente") && <WidgetAsistente locale={lang} textos={{ ...d.asistente, hab: d.tarjeta.hab, mes: d.tarjeta.mes }} />}
      </body>
    </html>
  );
}
