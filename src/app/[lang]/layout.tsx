import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, LOCALES, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { textoSobre } from "@/ui/color";
import { Cabecera } from "@/ui/layout/cabecera";
import { Pie } from "@/ui/layout/pie";
import { SCRIPT_TEMA } from "@/ui/layout/selectores";
import { WidgetAsistente } from "@/ui/asistente/widget";
import { BarraComparador } from "@/ui/visual/comparador";
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
    title: { default: NOMBRE_VISIBLE, template: `%s · ${NOMBRE_VISIBLE}` },
    description: t(d.meta.descripcion),
    applicationName: NOMBRE_VISIBLE,
    category: "real estate",
    formatDetection: { telephone: false, address: false, email: false },
    // Sin canónica aquí: cada página declara la suya (si no, heredarían la de la portada).
    openGraph: { siteName: NOMBRE_VISIBLE, locale: LOCALE_TAGS[lang].og, alternateLocale: LOCALES.filter((l) => l !== lang).map((l) => LOCALE_TAGS[l].og), type: "website", images: [{ url: `/api/og/sitio?lang=${lang}`, width: 1200, height: 630, alt: NOMBRE_VISIBLE }] },
    twitter: { card: "summary_large_image", images: [`/api/og/sitio?lang=${lang}`] },
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
        {publicada("comparar") && <BarraComparador href={ruta(lang, "comparar")} textos={{ comparar: d.tarjeta.comparar, elegidos: d.comparar.elegidos, vaciar: d.comparar.vaciar }} />}
        {publicada("asistente") && <WidgetAsistente locale={lang} textos={{ ...d.asistente, hab: d.tarjeta.hab, mes: d.tarjeta.mes }} />}
      </body>
    </html>
  );
}
