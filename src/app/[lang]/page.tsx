import { notFound } from "next/navigation";
import { publicada } from "@/config/secciones";
import { isLocale, ruta } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import { Aviso, BotonEnlace, Tarjeta } from "@/ui/componentes";
import s from "./inicio.module.css";

export default async function Inicio({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const hayAcciones = publicada("asistente") || publicada("valorar");
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
          ) : (
            <Aviso tipo="info" role="status">
              <p>{d.inicio.enPreparacion}</p>
            </Aviso>
          )}
        </div>
      </section>

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
