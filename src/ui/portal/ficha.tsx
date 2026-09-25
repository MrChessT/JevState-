import Link from "next/link";
import { BRAND } from "@/config/brand";
import { CATALOG } from "@/catalog/index";
import { LOCALE_TAGS, ruta, type Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import { frenteAZona } from "@/portal/estadisticas";
import { urlFicha } from "@/portal/filtros";
import type { EstadisticaZona, InmuebleFicha, InmuebleResumen } from "@/portal/tipos";
import { Aviso, BotonEnlace, EtiquetaConfianza } from "@/ui/componentes";
import { BotonFavorito, Compartir } from "./botones";
import { publicada } from "@/config/secciones";
import { BotonAbrirAsistente } from "@/ui/asistente/boton-abrir";
import { RangoPrecio } from "@/ui/visual/rango";
import { CAMPOS_CARACTERISTICAS, CAMPOS_CLAVE, CAMPOS_LEGALES, TablaCampos, textoCampo, textoPct } from "./campos";
import { euros, metros, numero } from "./formato";
import { Galeria } from "./galeria";
import { CalculadoraHipoteca } from "./hipoteca";
import { jsonLdInmueble, scriptJsonLd } from "./jsonld";
import { MapaResultados } from "./mapa";
import s from "./portal.module.css";
import { Tarjeta } from "./tarjeta";

export function Ficha({ i, zona, similares, locale, d }: { i: InmuebleFicha; zona: EstadisticaZona; similares: InmuebleResumen[]; locale: Locale; d: Diccionario }) {
  const url = urlFicha(locale, i);
  const venta = i.operacion === "venta";
  const pct = frenteAZona(i.precio, i.superficie, zona.medianaM2);
  const cert = i.campos.certificado_energetico;
  const legalesConValor = CAMPOS_LEGALES.filter((id) => i.campos[id]?.value === true);
  const opRuta = venta ? "venta" : "alquiler";
  return (
    <article className={`contenedor ${s.ficha}`} data-inmueble-viendo={i.ref}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: scriptJsonLd(jsonLdInmueble(i, url)) }} />
      <header className={s.fichaCabecera}>
        <nav aria-label="breadcrumb" className={s.migas}>
          <Link href={ruta(locale, opRuta)}>{venta ? d.buscar.tituloVenta : d.buscar.tituloAlquiler}</Link>
          {" › "}
          <Link href={ruta(locale, opRuta, i.zonaPath.split("/")[0]!)}>{i.municipioNombre}</Link>
          {i.zonaPath.includes("/") && (
            <>
              {" › "}
              <Link href={ruta(locale, opRuta, ...i.zonaPath.split("/"))}>{i.zonaNombre}</Link>
            </>
          )}
        </nav>
        <div className={s.fichaTitular}>
          <div className={s.fichaTitularTexto}>
            <h1>{i.titulo}</h1>
            <p className={s.fichaZona}>{i.zonaNombre === i.municipioNombre ? i.municipioNombre : `${i.zonaNombre}, ${i.municipioNombre}`} · {t(d.ficha.ref, { ref: i.ref })}</p>
            <ul className={s.fichaDatos}>
              {i.habitaciones !== null && (
                <li>
                  <strong>{i.habitaciones}</strong> {d.ficha.datoHab}
                </li>
              )}
              {i.banos !== null && (
                <li>
                  <strong>{i.banos}</strong> {d.ficha.datoBanos}
                </li>
              )}
              {i.superficie !== null && (
                <li>
                  <strong>{numero(locale, i.superficie)}</strong> m²
                </li>
              )}
              {i.precio && i.superficie && venta && (
                <li>
                  <strong>{numero(locale, Math.round(i.precio / i.superficie))}</strong> €/m²
                </li>
              )}
            </ul>
          </div>
          <div className={s.fichaPrecioCaja}>
            <p className={s.fichaPrecio}>
              {euros(locale, i.precio) ?? d.tarjeta.consultar}
              {!venta && i.precio && <span className={s.sufijo}>{d.tarjeta.mes}</span>}
            </p>
            {i.precioAnterior && i.precio && i.precioAnterior > i.precio && <p className={s.fichaAntes}>{t(d.tarjeta.rebajado, { precio: euros(locale, i.precioAnterior)! })}</p>}
            <div className={s.fichaAccionesCabecera}>
              <BotonFavorito refInmueble={i.ref} textos={{ guardar: d.tarjeta.favorito, quitar: d.tarjeta.quitarFavorito }} />
              <Compartir url={url} titulo={i.titulo} textos={{ compartir: d.ficha.compartir, copiado: d.ficha.copiado }} />
            </div>
            {publicada("asistente") && <BotonAbrirAsistente texto={d.ficha.preguntarAsistente} />}
          </div>
        </div>
      </header>

      <Galeria fotos={i.fotos} alt={i.titulo} textos={{ galeria: d.ficha.galeria, fotoDe: d.ficha.fotoDe, cerrar: d.ficha.cerrar, anterior: d.ficha.anteriorFoto, siguiente: d.ficha.siguienteFoto }} />

      <div className={s.fichaCuerpo}>
        <div style={{ display: "grid", gap: "var(--e-6)", minWidth: 0 }}>
          {legalesConValor.length > 0 && (
            <Aviso tipo="dudoso">
              <p>{legalesConValor.map((id) => CATALOG.fields.find((f) => f.id === id)!.label[locale === "es" ? "es" : "en"]).join(" · ")}</p>
            </Aviso>
          )}
          <section className={s.seccionFicha} aria-labelledby="datos">
            <h2 id="datos">{d.ficha.datosClave}</h2>
            <TablaCampos campos={i.campos} locale={locale} d={d} ids={CAMPOS_CLAVE} preguntar={url} />
          </section>
          <section className={s.seccionFicha} aria-labelledby="descripcion">
            <h2 id="descripcion">{d.ficha.descripcion}</h2>
            {i.descripcionTraducida && <p className={s.nota}>{d.ficha.traduccionAutomatica}</p>}
            <p className={s.descripcion}>{i.descripcion}</p>
          </section>
          <section className={s.seccionFicha} aria-labelledby="caracteristicas">
            <h2 id="caracteristicas">{d.ficha.caracteristicas}</h2>
            <TablaCampos campos={i.campos} locale={locale} d={d} ids={CAMPOS_CARACTERISTICAS} preguntar={url} />
          </section>
          <section className={s.seccionFicha} aria-labelledby="certificado">
            <h2 id="certificado">{d.ficha.certificado}</h2>
            <p>
              {textoCampo("certificado_energetico", cert, locale, d) ?? "—"}{" "}
              <EtiquetaConfianza estado={!cert || cert.value === null ? "no_consta" : cert.status} texto={d.confianza[!cert || cert.value === null ? "no_consta" : cert.status]} />
            </p>
          </section>
          <section className={s.seccionFicha} aria-labelledby="ubicacion">
            <h2 id="ubicacion">{d.ficha.ubicacion}</h2>
            {i.lat !== null && i.lon !== null && <MapaResultados puntos={[{ ref: i.ref, lat: i.lat, lon: i.lon, precio: i.precio }]} etiqueta={d.ficha.ubicacion} formatoPrecio={venta ? "venta" : "alquiler"} />}
            <p className={s.nota}>{d.ficha.ubicacionAproximada}</p>
            <h3>{d.ficha.alrededores}</h3>
            {i.distancias.length ? (
              <ul className={s.alrededores}>
                {i.distancias.map((x) => (
                  <li key={`${x.categoria}-${x.nombre}-${x.metros}`}>
                    <span>
                      {d.ficha.categorias[x.categoria as keyof typeof d.ficha.categorias] ?? x.categoria}
                      {x.nombre ? ` · ${x.nombre}` : ""}
                    </span>
                    <span>
                      {metros(locale, x.metros)} · {t(d.ficha.minutos, { n: x.minutos })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.nota}>{d.ficha.sinAlrededores}</p>
            )}
          </section>
          <section className={s.seccionFicha} aria-labelledby="frente-zona">
            <h2 id="frente-zona">{d.ficha.frenteZona}</h2>
            {pct !== null && zona.medianaM2 && zona.p25M2 && zona.p75M2 && zona.n >= 3 && i.precio && i.superficie ? (
              <RangoPrecio
                valor={i.precio / i.superficie}
                p25={Number(zona.p25M2)}
                p75={Number(zona.p75M2)}
                mediana={Number(zona.medianaM2)}
                etiquetaValor={`${numero(locale, Math.round(i.precio / i.superficie))} €/m²`}
                textos={{ barato: d.zonas.barato, caro: d.zonas.caro, descripcion: textoPct(pct, d, { m2: numero(locale, Math.round(i.precio / i.superficie)), zona: i.municipioNombre, mediana: numero(locale, zona.medianaM2), n: zona.n }) }}
              />
            ) : (
              <p>
                {pct !== null && zona.medianaM2 && i.precio && i.superficie
                  ? textoPct(pct, d, { m2: numero(locale, Math.round(i.precio / i.superficie)), zona: i.municipioNombre, mediana: numero(locale, zona.medianaM2), n: zona.n })
                  : t(d.ficha.sinDatosZona, { zona: i.municipioNombre })}
              </p>
            )}
          </section>
        </div>
        <aside className={s.lateral}>
          <section className={s.panel} id="contacto" aria-labelledby="contacto-titulo">
            <h2 id="contacto-titulo">{d.ficha.contacto}</h2>
            <p className={s.nota}>{d.ficha.contactoTexto}</p>
            <BotonEnlace href={`tel:${(i.agente?.telefono ?? BRAND.contact.phone).replace(/\s/g, "")}`} variante="secundario">
              {d.ficha.llamar} · {i.agente?.telefono ?? BRAND.contact.phone}
            </BotonEnlace>
          </section>
          {venta && i.precio && <CalculadoraHipoteca precio={i.precio} localeIntl={LOCALE_TAGS[locale].intl} textos={{ hipoteca: d.ficha.hipoteca, aviso: d.ficha.hipotecaAviso, entrada: d.ficha.entrada, interes: d.ficha.interes, plazo: d.ficha.plazo, cuota: d.ficha.cuota, prestamo: d.ficha.prestamo, ahorro: d.ficha.ahorro }} />}
        </aside>
      </div>

      {similares.length > 0 && (
        <section className={s.seccionFicha} aria-labelledby="similares">
          <h2 id="similares">{d.ficha.similares}</h2>
          <div className={s.lista}>
            {similares.map((x) => (
              <Tarjeta key={x.ref} i={x} locale={locale} d={d} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
