// Conceptos de proximidad en mensajes («cerca de la playa», «a 5 minutos del cole»). El código los
// detecta; Jev dice cuánto importan (muy_cerca / cerca / indiferente) y una tabla lo traduce a metros.
import { plano, type Tramo } from "./texto";

export type ConceptoProximidad = "playa" | "colegio" | "transporte" | "sanidad" | "comercio";

export interface MencionProximidad extends Tramo {
  concepto: ConceptoProximidad;
  /** Distancia explícita si el usuario la da: «a 500 m», «a 10 minutos andando». */
  distancia?: { valor: number; unidad: "m" | "km" | "min" };
}

const CONCEPTOS: Record<ConceptoProximidad, RegExp> = {
  playa: /\bplayas?\b|\bmar\b|\bcosta\b|\bprimera\s+linea\b|\bbeach\b|\bseaside\b/,
  colegio: /\bcolegios?\b|\bcoles?\b|\bescuelas?\b|\binstitutos?\b|\bguarderias?\b|\bschools?\b/,
  transporte: /\btranvia\b|\bautobus(es)?\b|\bbus\b|\bparadas?\b|\bestacion\b|\btren\b|\bcercanias\b|\btransporte\s+publico\b|\btram\b|\btrain\b/,
  sanidad: /\bhospital(es)?\b|\bcentro\s+de\s+salud\b|\bambulatorio\b|\burgencias\b|\bmedico\b|\bhealth\s+centre\b/,
  comercio: /\bsupermercados?\b|\btiendas\b|\bcomercios?\b|\bcentro\s+comercial\b|\bmercadona\b|\bshops?\b/,
};

/** Metros por concepto y nivel (sección 4.2, proximidad_i). Configurable en el plano de control. */
export const PROXIMIDAD_METROS: Record<ConceptoProximidad, { muy_cerca: number; cerca: number }> = {
  playa: { muy_cerca: 500, cerca: 2000 },
  colegio: { muy_cerca: 500, cerca: 1500 },
  transporte: { muy_cerca: 300, cerca: 800 },
  sanidad: { muy_cerca: 1000, cerca: 3000 },
  comercio: { muy_cerca: 400, cerca: 1200 },
};

/** Minutos andando → metros (80 m/min). */
export const METROS_POR_MINUTO = 80;

export function extraerProximidad(texto: string): MencionProximidad[] {
  const p = plano(texto);
  const out: MencionProximidad[] = [];
  for (const [concepto, re] of Object.entries(CONCEPTOS) as Array<[ConceptoProximidad, RegExp]>) {
    for (const m of p.matchAll(new RegExp(re.source, "g"))) {
      // «mar menor» y «mar» como parte de nombres de zona siguen siendo costa; «mar» en «marzo» no casa por \b.
      const previo = p.slice(Math.max(0, m.index! - 35), m.index!);
      const d = /\ba\s+(\d+(?:[.,]\d+)?)\s*(m|metros|km|kilometros|min|minutos)\b[^.]{0,20}$/.exec(previo);
      const mencion: MencionProximidad = { concepto, literal: texto.slice(m.index!, m.index! + m[0].length), inicio: m.index!, fin: m.index! + m[0].length };
      if (d) {
        const valor = Number(d[1]!.replace(",", "."));
        const u = d[2]!;
        mencion.distancia = { valor, unidad: u.startsWith("k") ? "km" : u.startsWith("min") ? "min" : "m" };
      }
      out.push(mencion);
    }
  }
  // Un concepto una vez por frase basta: se quedan las menciones que no se solapan.
  return out.sort((a, b) => a.inicio - b.inicio).filter((x, i, arr) => arr.findIndex((y) => y.concepto === x.concepto) === i);
}

export function distanciaEnMetros(d: NonNullable<MencionProximidad["distancia"]>): number {
  return d.unidad === "km" ? d.valor * 1000 : d.unidad === "min" ? d.valor * METROS_POR_MINUTO : d.valor;
}
