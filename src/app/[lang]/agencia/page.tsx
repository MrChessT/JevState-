import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import { Tarjeta } from "@/ui/componentes";

export async function generateMetadata({ params }: PageProps<"/[lang]/agencia">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const d = await diccionario(lang);
  const alt = alternativas(BRAND.siteUrl, "agencia");
  return { title: d.agencia.titulo, alternates: { canonical: alt[LOCALE_TAGS[lang].intl], languages: alt } };
}

export default async function Agencia({ params }: PageProps<"/[lang]/agencia">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const jsonLd = { "@context": "https://schema.org", "@type": "RealEstateAgent", name: NOMBRE_VISIBLE, url: BRAND.siteUrl, telephone: BRAND.contact.phone, email: BRAND.contact.email, address: { "@type": "PostalAddress", streetAddress: BRAND.contact.address, addressLocality: BRAND.contact.city, addressRegion: "Región de Murcia", addressCountry: "ES" } };
  return (
    <div className="contenedor texto-largo" style={{ paddingBlock: "var(--e-7)", display: "grid", gap: "var(--e-5)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <h1>{d.agencia.titulo}</h1>
      <p>{d.agencia.texto}</p>
      <Tarjeta>
        <h2 style={{ fontSize: "var(--t-lg)" }}>{d.agencia.contacto}</h2>
        <p>
          {BRAND.contact.address}, {BRAND.contact.city}
          <br />
          <a href={`tel:${BRAND.contact.phone.replace(/\s/g, "")}`}>{BRAND.contact.phone}</a> · <a href={`mailto:${BRAND.contact.email}`}>{BRAND.contact.email}</a>
        </p>
      </Tarjeta>
    </div>
  );
}
