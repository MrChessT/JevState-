import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, ruta } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import Link from "next/link";
import { FOTOS } from "@/config/imagenes";
import { publicada } from "@/config/secciones";
import { portal } from "@/portal/datos";
import { numero } from "@/ui/portal/formato";
import { Banner } from "@/ui/visual/banner";
import v from "@/ui/visual/paginas.module.css";

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
  const todas = await (await portal()).todas();
  const municipios = new Set(todas.map((i) => i.zonaPath.split("/")[0])).size;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Banner
        foto={FOTOS.villa}
        credito={d.inicio.fotoCredito}
        antetitulo={d.agencia.antetitulo}
        titulo={NOMBRE_VISIBLE}
        texto={d.agencia.subtitulo}
        cifras={[
          { etiqueta: d.zonas.cifraInmuebles, valor: numero(lang, todas.length) },
          { etiqueta: d.zonas.cifraMunicipios, valor: numero(lang, municipios) },
          { etiqueta: d.inicio.cifras.fuente, valor: "100 %" },
        ]}
        acciones={
          <>
            {publicada("asistente") && <Link href={ruta(lang, "asistente")}>{d.agencia.probarAsistente}</Link>}
            <a href={`mailto:${BRAND.contact.email}`}>{d.agencia.escribir}</a>
          </>
        }
      />
      <div className={`contenedor ${v.pagina}`}>
        <section aria-labelledby="pasos" className={v.bloque}>
          <h2 id="pasos">{d.agencia.pasosTitulo}</h2>
          <ol className={v.pasos}>
            {d.agencia.pasos.map((p) => (
              <li key={p.titulo}>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="contacto" className={v.contacto}>
          <div>
            <h2 id="contacto">{d.agencia.contacto}</h2>
            <p>{d.agencia.contactoTexto}</p>
          </div>
          <div className={v.contactoDatos}>
            <span>
              {BRAND.contact.address}, {BRAND.contact.city}
            </span>
            <a href={`tel:${BRAND.contact.phone.replace(/\s/g, "")}`}>{BRAND.contact.phone}</a>
            <a href={`mailto:${BRAND.contact.email}`}>{BRAND.contact.email}</a>
          </div>
        </section>
      </div>
    </>
  );
}
