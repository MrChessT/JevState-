import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/config/brand";
import { alternativas, isLocale, LOCALE_TAGS, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { portal } from "@/portal/datos";
import { ZONAS } from "@/zonas/buscar";
import { FOTO_ZONA, FOTOS, urlFoto } from "@/config/imagenes";
import { numero } from "@/ui/portal/formato";
import { Banner } from "@/ui/visual/banner";
import v from "@/ui/visual/paginas.module.css";
import vs from "@/ui/visual/visual.module.css";

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
  const repo = await portal();
  const todas = await repo.todas();
  const municipios = await Promise.all(
    ZONAS.filter((z) => z.nivel === "municipio").map(async (z) => {
      const deZona = todas.filter((i) => i.zonaPath.split("/")[0] === z.path);
      const venta = deZona.filter((i) => i.operacion === "venta").length;
      const alquiler = deZona.length - venta;
      const est = venta > 0 ? await repo.estadistica(z.path, "venta") : null;
      return { z, venta, alquiler, mediana: est?.medianaM2 ? Number(est.medianaM2) : null };
    }),
  );
  const conOferta = municipios.filter((m) => m.venta + m.alquiler > 0).sort((a, b) => b.venta + b.alquiler - (a.venta + a.alquiler) || a.z.nombre.localeCompare(b.z.nombre, "es"));
  const sinOferta = municipios.filter((m) => m.venta + m.alquiler === 0).sort((a, b) => a.z.nombre.localeCompare(b.z.nombre, "es"));
  const conMediana = conOferta.filter((m) => m.mediana !== null && m.venta >= 3).sort((a, b) => b.mediana! - a.mediana!);
  const maxMediana = Math.max(1, ...conMediana.map((m) => m.mediana!));
  const m2 = todas.filter((i) => i.operacion === "venta" && i.precio && i.superficie).map((i) => i.precio! / i.superficie!).sort((a, b) => a - b);
  const regional = m2.length ? { medianaM2: Math.round(m2[Math.floor(m2.length / 2)]!) } : null;
  return (
    <>
      <Banner
        foto={FOTOS.pueblo}
        credito={d.inicio.fotoCredito}
        antetitulo={d.zonas.antetitulo}
        titulo={d.zonas.titulo}
        texto={d.zonas.intro}
        cifras={[
          { etiqueta: d.zonas.cifraMunicipios, valor: numero(lang, conOferta.length) },
          { etiqueta: d.zonas.cifraInmuebles, valor: numero(lang, todas.length) },
          ...(regional?.medianaM2 ? [{ etiqueta: d.zonas.cifraMediana, valor: t(d.zonas.mediana, { m2: numero(lang, regional.medianaM2) }) }] : []),
        ]}
      />
      <div className={`contenedor ${v.pagina}`}>
        {conMediana.length > 0 && (
          <section aria-labelledby="barras" className={v.bloque}>
            <div>
              <h2 id="barras">{d.zonas.barrasTitulo}</h2>
              <p className={v.nota}>{d.zonas.barrasTexto}</p>
            </div>
            <ul className={vs.barras}>
              {conMediana.map((m) => (
                <li key={m.z.path}>
                  <Link href={ruta(lang, "zonas", m.z.path)}>
                    <span className={vs.barraNombre}>{m.z.nombre}</span>
                    <span className={vs.barraPista} aria-hidden="true">
                      <span className={vs.barra} style={{ display: "block", width: `${((m.mediana! / maxMediana) * 100).toFixed(1)}%` }} />
                    </span>
                    <span className={vs.barraValor}>
                      <strong>{t(d.zonas.mediana, { m2: numero(lang, m.mediana!) })}</strong> · {t(d.zonas.enVenta, { n: m.venta })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="con-oferta" className={v.bloque}>
          <h2 id="con-oferta">{d.zonas.conOferta}</h2>
          <ul className={v.tarjetasZona}>
            {conOferta.map(({ z, venta, alquiler, mediana }, k) => (
              <li key={z.path}>
                <Link href={ruta(lang, "zonas", z.path)} className={v.tarjetaZona} data-tono={k % 3}>
                  {FOTO_ZONA[z.path] && (
                    <span className={v.tarjetaZonaFoto} style={{ backgroundImage: `url(${urlFoto(FOTO_ZONA[z.path]!, 700)})` }} aria-hidden="true" />
                  )}
                  <strong>{z.nombre}</strong>
                  <span>
                    {t(d.zonas.enVenta, { n: venta })} · {t(d.zonas.enAlquiler, { n: alquiler })}
                  </span>
                  {mediana && <em>{t(d.zonas.mediana, { m2: numero(lang, mediana) })}</em>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {sinOferta.length > 0 && (
          <section aria-labelledby="sin-oferta" className={v.bloque}>
            <h2 id="sin-oferta" className={v.subtitulo}>
              {d.zonas.sinOferta}
            </h2>
            <p className={v.enlacesLinea}>
              {sinOferta.map(({ z }, k) => (
                <span key={z.path}>
                  <Link href={ruta(lang, "zonas", z.path)}>{z.nombre}</Link>
                  {k < sinOferta.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </section>
        )}
      </div>
    </>
  );
}
