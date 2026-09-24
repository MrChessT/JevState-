import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, LOCALES } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { DOCS_LEGALES, LEGAL_ACTUALIZADO, LEGAL_REVISADO, TEXTOS_LEGALES, type DocLegal } from "@/legal/textos";
import { Aviso } from "@/ui/componentes";

const esDoc = (d: string): d is DocLegal => (DOCS_LEGALES as string[]).includes(d);

export function generateStaticParams() {
  return LOCALES.flatMap((lang) => DOCS_LEGALES.map((doc) => ({ lang, doc })));
}

function variables(): Record<string, string> {
  return {
    razon: BRAND.legalName,
    nif: BRAND.taxId || "[NIF pendiente]",
    direccion: `${BRAND.contact.address}, ${BRAND.contact.city}`,
    email: BRAND.contact.email,
    registro: BRAND.agentRegistry,
  };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/legal/[doc]">): Promise<Metadata> {
  const { lang, doc } = await params;
  if (!isLocale(lang) || !esDoc(doc)) return {};
  const alt = alternativas(BRAND.siteUrl, "legal", doc);
  return { title: TEXTOS_LEGALES[doc][lang].titulo, alternates: { canonical: alt[LOCALE_TAGS[lang].intl], languages: alt } };
}

export default async function Legal({ params }: PageProps<"/[lang]/legal/[doc]">) {
  const { lang, doc } = await params;
  if (!isLocale(lang) || !esDoc(doc)) notFound();
  const d = await diccionario(lang);
  const texto = TEXTOS_LEGALES[doc][lang];
  const vars = variables();
  const fecha = new Intl.DateTimeFormat(LOCALE_TAGS[lang].intl, { dateStyle: "long" }).format(new Date(LEGAL_ACTUALIZADO));
  return (
    <article className="contenedor texto-largo" style={{ paddingBlock: "var(--e-7)" }}>
      <h1>{texto.titulo}</h1>
      <p style={{ color: "var(--texto-suave)" }}>{t(d.legal.actualizado, { fecha })}</p>
      {!LEGAL_REVISADO && (
        <Aviso tipo="dudoso">
          <p>{d.legal.borrador}</p>
        </Aviso>
      )}
      {texto.secciones.map((s) => (
        <section key={s.titulo} style={{ marginTop: "var(--e-6)" }}>
          <h2>{s.titulo}</h2>
          {s.parrafos.map((p) => t(p, vars)).filter((p) => p.trim() !== "").map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
