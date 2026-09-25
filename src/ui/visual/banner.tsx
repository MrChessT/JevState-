import type { ReactNode } from "react";
import { urlFoto, type Foto } from "@/config/imagenes";
import s from "./visual.module.css";

/** Cabecera de sección con foto de ambiente, degradado de marca y cifras opcionales. */
export function Banner({ foto, antetitulo, titulo, texto, cifras, acciones, credito }: { foto?: Foto; antetitulo?: string; titulo: string; texto?: string; cifras?: Array<{ etiqueta: string; valor: string }>; acciones?: ReactNode; credito?: string }) {
  return (
    <section className={s.banner}>
      {foto && (
        <span className={s.bannerFoto} style={{ backgroundImage: `url(${urlFoto(foto, 1800)})` }} aria-hidden="true" />
      )}
      <div className={`contenedor ${s.bannerInterior}`}>
        {antetitulo && <p className={s.bannerAntetitulo}>{antetitulo}</p>}
        <h1>{titulo}</h1>
        {texto && <p className={s.bannerTexto}>{texto}</p>}
        {cifras && cifras.length > 0 && (
          <dl className={s.bannerCifras}>
            {cifras.map((c) => (
              <div key={c.etiqueta}>
                <dt>{c.etiqueta}</dt>
                <dd>{c.valor}</dd>
              </div>
            ))}
          </dl>
        )}
        {acciones && <div className={s.bannerAcciones}>{acciones}</div>}
      </div>
      {foto && credito && (
        <a className={s.bannerCredito} href={foto.pagina} target="_blank" rel="noopener">
          {credito}
        </a>
      )}
    </section>
  );
}
