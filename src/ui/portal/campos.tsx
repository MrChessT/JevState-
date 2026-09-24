import { CATALOG } from "@/catalog/index";
import type { Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import type { CampoCanonico } from "@/sde/cascada/canonico";
import { EtiquetaConfianza } from "@/ui/componentes";
import { euros, numero } from "./formato";
import s from "./portal.module.css";

/** Valor legible de un campo; null si no consta. */
export function textoCampo(id: string, c: CampoCanonico | undefined, locale: Locale, d: Diccionario): string | null {
  if (!c || c.value === null || c.status === "no_consta") return null;
  const f = CATALOG.fields.find((x) => x.id === id);
  const v = c.value;
  if (typeof v === "boolean") return v ? d.valores.si : d.valores.no;
  if (f?.type === "currency") return `${euros(locale, Number(v))}${f.unit === "EUR/mes" ? d.tarjeta.mes : f.unit === "EUR/año" ? (locale === "es" ? "/año" : "/year") : ""}`;
  if (f?.type === "area") return `${numero(locale, Number(v))} m²`;
  if (f?.type === "decimal") return `${v}${f.unit === "%" ? " %" : ""}`;
  if (id === "planta") return Number(v) === 0 ? d.valores.bajo : `${v}ª`;
  if (id === "certificado_energetico" && /^[a-g]$/.test(String(v))) return String(v).toUpperCase();
  if (id === "tipo") return d.tipos[String(v) as keyof typeof d.tipos] ?? String(v);
  if (id === "zona" || id === "direccion") return null;
  return d.valores[String(v) as keyof typeof d.valores] ?? String(v);
}

/**
 * Características con su estado (sección 2.1): «Terraza: sí ✓ confirmado», «¿Ascensor? no consta».
 * Solo campos públicos; lo que no consta se dice y se ofrece preguntar al agente.
 */
export function TablaCampos({ campos, locale, d, ids, preguntar }: { campos: Record<string, CampoCanonico>; locale: Locale; d: Diccionario; ids: string[]; preguntar?: string }) {
  return (
    <dl className={s.campos}>
      {ids.map((id) => {
        const f = CATALOG.fields.find((x) => x.id === id);
        if (!f?.public) return null;
        const c = campos[id];
        const valor = textoCampo(id, c, locale, d);
        const estado = !c || valor === null ? "no_consta" : c.status;
        const etiqueta = f.label[locale === "es" ? "es" : "en"];
        return (
          <div key={id} className={s.campo}>
            <dt>{etiqueta}</dt>
            <dd>
              <span>{valor ?? "—"}</span>{" "}
              <EtiquetaConfianza estado={estado} texto={d.confianza[estado]} titulo={estado === "no_consta" ? d.confianza.noConstaAyuda : estado === "probable" ? d.confianza.probableAyuda : undefined} />
              {estado === "no_consta" && preguntar && (
                <a className={s.preguntar} href={`${preguntar}${preguntar.includes("?") ? "&" : "?"}campo=${id}#contacto`}>
                  {d.ficha.noConstaPregunta}
                </a>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export const CAMPOS_CLAVE = ["tipo", "precio", "superficie_construida", "superficie_util", "superficie_parcela", "habitaciones", "banos", "planta", "planta_tipo", "estado", "gastos_comunidad", "ibi"];
export const CAMPOS_CARACTERISTICAS = ["terraza", "balcon", "ascensor", "garaje", "trastero", "piscina", "aire_acondicionado", "calefaccion", "exterior", "orientacion", "luminosidad", "ruido", "vistas", "amueblado", "accesible", "calidad_acabados"];
export const CAMPOS_LEGALES = ["vpo", "okupado", "nuda_propiedad", "subasta", "alquilado_con_inquilino", "negociable", "licencia_turistica"];

export function textoPct(pct: number, d: Diccionario, datos: { m2: string; zona: string; mediana: string; n: number }): string {
  return t(d.ficha.frenteZonaTexto, { ...datos, pct: Math.abs(pct), dir: pct < 0 ? d.ficha.por_debajo : d.ficha.por_encima });
}
