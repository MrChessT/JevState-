import { notFound } from "next/navigation";
import { publicada } from "@/config/secciones";
import { isLocale, ruta } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import { Aviso, BotonEnlace, Tarjeta } from "@/ui/componentes";
import { portal } from "@/portal/datos";
import { leerFiltros } from "@/portal/filtros";
import { FiltrosForm } from "@/ui/portal/filtros-form";
import ps from "@/ui/portal/portal.module.css";
import { Tarjeta as TarjetaInmueble } from "@/ui/portal/tarjeta";
import s from "./inicio.module.css";

// Datos del portal: se regeneran cada 10 minutos (ISR).
export const revalidate = 600;

export default async function Inicio({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const hayAcciones = publicada("asistente") || publicada("valorar");
  const destacados = publicada("venta") ? await (await portal()).destacados(6) : [];
  return (
    <>
      <section className={s.heroe}>
        <div className="contenedor">
          <h1>{d.inicio.titulo}</h1>
          <p className={s.subtitulo}>{d.inicio.subtitulo}</p>
          {hayAcciones ? (
            <div className={s.acciones}>
              {publicada("asistente") && <BotonEnlace href={ruta(lang, "asistente")}>{d.inicio.ctaAsistente}</BotonEnlace>}
              {publicada("valorar") && (
                <BotonEnlace href={ruta(lang, "valorar")} variante="secundario">
                  {d.inicio.ctaValorar}
                </BotonEnlace>
              )}
            </div>
          ) : !publicada("venta") ? (
            <Aviso tipo="info" role="status">
              <p>{d.inicio.enPreparacion}</p>
            </Aviso>
          ) : null}
          {publicada("venta") && <FiltrosForm f={leerFiltros("venta", undefined, {})} locale={lang} d={d} compacto />}
        </div>
      </section>

      {destacados.length > 0 && (
        <section className={`contenedor ${s.seccion}`} aria-labelledby="destacados">
          <h2 id="destacados">{d.buscar.tituloVenta}</h2>
          <div className={ps.lista}>
            {destacados.map((i, k) => (
              <TarjetaInmueble key={i.ref} i={i} locale={lang} d={d} prioridad={k < 2} />
            ))}
          </div>
          <p style={{ marginTop: "var(--e-4)" }}>
            <BotonEnlace href={ruta(lang, "venta")} variante="secundario">
              {d.buscar.tituloVenta} →
            </BotonEnlace>
          </p>
        </section>
      )}

      <section className={`contenedor ${s.seccion}`} aria-labelledby="promesas">
        <h2 id="promesas">{d.inicio.promesasTitulo}</h2>
        <div className={s.rejilla}>
          {d.inicio.promesas.map((p) => (
            <Tarjeta key={p.titulo}>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </Tarjeta>
          ))}
        </div>
      </section>

      <section className={`contenedor ${s.seccion}`} aria-labelledby="captacion">
        <Tarjeta className={s.captacion}>
          <div>
            <h2 id="captacion">{d.inicio.captacionTitulo}</h2>
            <p>{d.inicio.captacionTexto}</p>
          </div>
          {publicada("valorar") && (
            <div>
              <BotonEnlace href={ruta(lang, "valorar")} variante="acento">
                {d.inicio.ctaValorar}
              </BotonEnlace>
            </div>
          )}
        </Tarjeta>
      </section>
    </>
  );
}
