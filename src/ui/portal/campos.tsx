import { campo as campoCatalogo } from "@/catalog/publico";
import type { Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import type { CampoCanonico } from "@/sde/cascada/canonico";
import { EtiquetaConfianza } from "@/ui/componentes";
import { textoCampo } from "./texto-campo";
import s from "./portal.module.css";

export { textoCampo };

/**
 * Características con su estado (sección 2.1): «Terraza: sí ✓ confirmado», «¿Ascensor? no consta».
 * Solo campos públicos; lo que no consta se dice y se ofrece preguntar al agente.
 */
export function TablaCampos({ campos, locale, d, ids, preguntar }: { campos: Record<string, CampoCanonico>; locale: Locale; d: Diccionario; ids: string[]; preguntar?: string }) {
  const publicos = ids.map((id) => campoCatalogo(id)).filter((f): f is NonNullable<typeof f> => Boolean(f?.public));
  const conValor = publicos.filter((f) => textoCampo(f.id, campos[f.id], locale, d) !== null);
  const sinValor = publicos.filter((f) => textoCampo(f.id, campos[f.id], locale, d) === null);
  const etiqueta = (f: (typeof publicos)[number]) => f.label[locale === "es" ? "es" : "en"];
  return (
    <>
      {conValor.length > 0 && (
        <dl className={s.campos}>
          {conValor.map((f) => {
            const c = campos[f.id]!;
            return (
              <div key={f.id} className={s.campo}>
                <dt>{etiqueta(f)}</dt>
                <dd>
                  <span>{textoCampo(f.id, c, locale, d)}</span>{" "}
                  <EtiquetaConfianza estado={c.status} texto={d.confianza[c.status]} titulo={c.status === "probable" ? d.confianza.probableAyuda : undefined} />
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {sinValor.length > 0 && (
        <p className={s.noConstan}>
          <span className={s.noConstanTitulo}>{d.ficha.noConstan}</span> {sinValor.map((f) => etiqueta(f).toLowerCase()).join(", ")}.{" "}
          {preguntar && (
            <a className={s.preguntar} href={`${preguntar}${preguntar.includes("?") ? "&" : "?"}campo=${sinValor.map((f) => f.id).join(",")}#contacto`}>
              {d.ficha.noConstaPregunta}
            </a>
          )}
        </p>
      )}
    </>
  );
}

export const CAMPOS_CLAVE = ["tipo", "precio", "superficie_construida", "superficie_util", "superficie_parcela", "habitaciones", "banos", "planta", "planta_tipo", "estado", "gastos_comunidad", "ibi"];
export const CAMPOS_CARACTERISTICAS = ["terraza", "balcon", "ascensor", "garaje", "trastero", "piscina", "aire_acondicionado", "calefaccion", "exterior", "orientacion", "luminosidad", "ruido", "vistas", "amueblado", "accesible", "calidad_acabados"];
export const CAMPOS_LEGALES = ["vpo", "okupado", "nuda_propiedad", "subasta", "alquilado_con_inquilino", "negociable", "licencia_turistica"];

export function textoPct(pct: number, d: Diccionario, datos: { m2: string; zona: string; mediana: string; n: number }): string {
  return t(d.ficha.frenteZonaTexto, { ...datos, pct: Math.abs(pct), dir: pct < 0 ? d.ficha.por_debajo : d.ficha.por_encima });
}
