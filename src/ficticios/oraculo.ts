// Jev «oráculo»: responde según la verdad de referencia de los ficticios. Sirve para medir todo lo que
// NO es Jev (extracción, cascada, puertas, adjudicación) con un Jev perfecto; con Jev real se mide Jev.
import Decimal from "decimal.js";
import type { ChoiceCriteria, EntryType } from "@typesafe-ai/sdk";
import type { CompiledCatalog } from "@/catalog/schema";
import type { Responder } from "@/jev/fake";
import type { ValorVerdad } from "./generador";

const primerNumero = (s: string): Decimal | null => {
  const m = /-?\d+(?:\.\d+)?/.exec(s);
  return m ? new Decimal(m[0]) : null;
};

function igualNumero(a: Decimal | null, t: ValorVerdad): boolean {
  return a !== null && t !== null && t !== undefined && typeof t !== "boolean" && a.eq(new Decimal(t));
}

export function oraculo(verdades: Map<string, Record<string, ValorVerdad>>, catalog: CompiledCatalog): Responder {
  const campos = new Map(catalog.fields.map((f) => [f.id, f]));
  return (id, q, state) => {
    const ref = ((state as { listing?: { ref?: string } })?.listing?.ref) ?? "";
    const v = verdades.get(ref);
    if (!v) return undefined;
    const [campo, sufijo] = id.split("__") as [string, string | undefined];
    const f = campos.get(campo);
    const t = v[campo] ?? null;
    if (!f) return undefined;
    if (sufijo === "consta") return t !== null ? 0.95 : 0.05;
    if (sufijo === "motivo") return campo === "precio" && v.precio_anterior ? "precio_rebajado" : "no_determinable";
    if (sufijo === "verificar") {
      const texto = typeof q.instructions === "string" ? q.instructions : JSON.stringify(q.instructions);
      return igualNumero(primerNumero(texto), t) ? 0.95 : 0.05;
    }
    if (sufijo === "candidato" && q.type === "choice") {
      for (const [k, d] of Object.entries(q.criteria as ChoiceCriteria)) {
        const valor = d && typeof d === "object" && !Array.isArray(d) ? String((d as Record<string, EntryType>).value ?? "") : "";
        if (igualNumero(primerNumero(valor), t)) return { winner: k, p: 0.95 };
      }
      return { winner: "ninguno", p: 0.95 };
    }
    if (q.type === "noul") return t === true ? 0.95 : 0.05;
    if (q.type === "choice") {
      const opciones = Object.keys(q.criteria);
      return typeof t === "string" && opciones.includes(t) ? { winner: t, p: 0.95 } : { winner: opciones.includes("no_consta") ? "no_consta" : opciones[0]!, p: 0.95 };
    }
    if (q.type === "score") {
      const idx = typeof t === "string" ? (f.enumValues ?? []).indexOf(t) : -1;
      return { score: Math.max(0, idx), confidence: 0.9 };
    }
    return undefined;
  };
}
