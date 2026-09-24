import type { RegistroFuente } from "@/ingesta/tipos";
import { evidenciasDeFeed } from "./desde-feed";
import { evidenciasDeHtml } from "./desde-html";
import { evidenciasDeTexto } from "./desde-texto";
import type { Evidencia } from "./tipos";

/** Todas las evidencias de un registro, sin duplicados (mismo id). */
export function construirEvidencias(r: RegistroFuente): Evidencia[] {
  const todas: Evidencia[] = [
    ...evidenciasDeFeed(r),
    // La descripción del feed es texto visible del anuncio (la fuente más débil).
    ...Object.entries(r.descripcion).flatMap(([locale, texto]) =>
      locale === "es" || Object.keys(r.descripcion).length === 1
        ? evidenciasDeTexto(texto ?? "", { listingKey: r.ref, source: "visible_text", pathBase: `desc/${locale}`, capturedAt: r.capturadoEn })
        : [],
    ),
    ...(r.html ? evidenciasDeHtml(r.html, r.ref, r.capturadoEn) : []),
  ];
  const vistos = new Set<string>();
  return todas.filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)));
}

export { type Evidencia } from "./tipos";
