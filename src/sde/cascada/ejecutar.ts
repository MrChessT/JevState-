// Orquestación de la cascada SDE por paquetes (sección 3.3): cada paquete es UNA petición
// systemOne; los paquetes de un inmueble van en paralelo con límite de concurrencia por paquete
// y reintentos con backoff. El resultado es el JSON canónico, la cola de revisión y la auditoría.
import type { EntryType, Questions } from "@typesafe-ai/sdk";
import type { CompiledCatalog, CompiledPack } from "@/catalog/schema";
import { evidencia as nuevaEvidencia, ESTRUCTURADAS, type Evidencia } from "@/evidencia/tipos";
import { decisionRecord, type JevDecision } from "@/jev/decisions";
import type { JevPort } from "@/jev/port";
import { sinDatosPersonales } from "@/jev/privacidad";
import { CANONICO_SCHEMA_VERSION, CanonicoInmueble, type CampoCanonico, type ItemRevision } from "./canonico";
import { conReintentos, limitador, type OpcionesReintento } from "./concurrencia";
import { planificarCampo, type PlanCampo, type ResultadoCampo } from "./planificar";

export interface OpcionesCascada {
  jev: JevPort;
  catalog: CompiledCatalog;
  modo?: "normal" | "sin_jev";
  /** Correcciones manuales vigentes: siempre ganan y no se reprocesan. */
  manuales?: Record<string, CampoCanonico>;
  /** Limitadores por paquete compartidos entre inmuebles (max_concurrency del catálogo). */
  limitadores?: Map<string, ReturnType<typeof limitador>>;
  reintentos?: OpcionesReintento;
  ahora?: () => Date;
  signal?: AbortSignal;
}

export interface EntradaCascada {
  ref: string;
  evidencias: Evidencia[];
  /** Descripción principal (se envía a Jev sin datos personales y recortada). */
  descripcion: string;
  titulo?: string;
  capturadoEn: string;
}

export interface ResultadoPaquete {
  paquete: string;
  etapa: CompiledPack["stage"];
  preguntas: number;
  llamada: boolean;
  cached: boolean;
  ms: number;
  error?: string;
}

export interface ResultadoCascada {
  canonico: CanonicoInmueble;
  revisiones: ItemRevision[];
  decisiones: JevDecision[];
  /** Evidencias creadas durante la cascada (citas de la descripción completa). */
  evidenciasNuevas: Evidencia[];
  paquetes: ResultadoPaquete[];
  modo: "normal" | "sin_jev";
}

const MAX_DESCRIPCION = 3500;
const REINTENTOS: OpcionesReintento = { intentos: 3, baseMs: 400, maxMs: 4000 };

/** Límite de concurrencia global por paquete (proceso). */
const LIMITADORES = new Map<string, ReturnType<typeof limitador>>();

function limitadorDe(p: CompiledPack, mapa: Map<string, ReturnType<typeof limitador>>) {
  let l = mapa.get(p.id);
  if (!l) {
    l = limitador(p.maxConcurrency);
    mapa.set(p.id, l);
  }
  return l;
}

/** Valor preliminar (evidencia estructurada más fuerte) para evaluar condiciones de paquete. */
function preliminar(evs: Evidencia[], campo: string): string | undefined {
  const e = evs.filter((x) => x.campo === campo && ESTRUCTURADAS.has(x.source) && typeof x.parsed.valor === "string").sort((a, b) => b.sourceWeight - a.sourceWeight)[0];
  return e?.parsed.valor as string | undefined;
}

function cumpleCondicion(p: CompiledPack, evs: Evidencia[]): boolean {
  if (!p.condition) return true;
  const v = preliminar(evs, p.condition.field);
  return v !== undefined && p.condition.values.includes(v);
}

export async function enriquecer(entrada: EntradaCascada, o: OpcionesCascada): Promise<ResultadoCascada> {
  const { catalog } = o;
  const modo = o.modo ?? "normal";
  const ahora = o.ahora ?? (() => new Date());
  const porCampo = new Map<string, Evidencia[]>();
  for (const e of entrada.evidencias) porCampo.set(e.campo, [...(porCampo.get(e.campo) ?? []), e]);

  const descripcion = sinDatosPersonales(entrada.descripcion).slice(0, MAX_DESCRIPCION);
  const refs = new Map<string, string>();
  const ref = (e: Evidencia) => {
    let r = refs.get(e.id);
    if (!r) {
      r = `E${refs.size + 1}`;
      refs.set(e.id, r);
    }
    return r;
  };
  const evidenciaDescripcion = (campo: string): Evidencia | null =>
    entrada.descripcion.trim()
      ? nuevaEvidencia({ listingKey: entrada.ref, source: "visible_text", path: "desc/completa", raw: entrada.descripcion.slice(0, 1000), campo, parsed: { valor: "descripcion_completa" }, capturedAt: entrada.capturadoEn })
      : null;
  const ctx = { catalogVersion: catalog.version, ref, evidenciaDescripcion, hayDescripcion: Boolean(descripcion.trim()) };

  const campos: Record<string, CampoCanonico> = {};
  const revisiones: ItemRevision[] = [];
  const decisiones: JevDecision[] = [];
  const evidenciasNuevas: Evidencia[] = [];
  const paquetes: ResultadoPaquete[] = [];

  const aplicar = (id: string, r: ResultadoCampo, paquete: string, model: string, cached: boolean) => {
    campos[id] = r.campo;
    if (r.revision) revisiones.push(r.revision);
    if (r.evidenciasNuevas) evidenciasNuevas.push(...r.evidenciasNuevas);
    for (const d of r.decisiones)
      decisiones.push(
        decisionRecord({
          purpose: `sde.${paquete}`,
          questionId: d.questionId,
          question: d.question,
          answer: d.answer,
          chosen: d.chosen,
          gateKey: `campo:${id}`,
          gate: { act: d.gate.act, ask: d.gate.ask, ...(d.gate.minMargin !== undefined ? { minMargin: d.gate.minMargin } : {}) },
          outcome: d.outcome,
          catalogVersion: catalog.version,
          model,
          cached,
          now: ahora(),
        }),
      );
  };

  await Promise.all(
    catalog.packs.map(async (p) => {
      const planes = new Map<string, PlanCampo>();
      if (!cumpleCondicion(p, entrada.evidencias)) {
        paquetes.push({ paquete: p.id, etapa: p.stage, preguntas: 0, llamada: false, cached: false, ms: 0 });
        return;
      }
      for (const id of p.fields) {
        if (o.manuales?.[id]) continue; // la corrección manual gana
        const f = catalog.fields.find((x) => x.id === id)!;
        const r = catalog.adjudication.find((x) => x.field === id);
        planes.set(id, planificarCampo(f, r, porCampo.get(id) ?? [], p.stage, ctx));
      }
      const conJev = [...planes.entries()].filter(([, pl]) => pl.tipo === "jev") as Array<[string, Extract<PlanCampo, { tipo: "jev" }>]>;
      for (const [id, pl] of planes) if (pl.tipo === "resuelto") aplicar(id, pl.resultado, p.id, "codigo", false);
      if (conJev.length === 0) {
        paquetes.push({ paquete: p.id, etapa: p.stage, preguntas: 0, llamada: false, cached: false, ms: 0 });
        return;
      }
      const preguntas: Questions = Object.assign({}, ...conJev.map(([, pl]) => pl.preguntas));
      const t0 = performance.now();
      if (modo === "sin_jev") {
        for (const [id, pl] of conJev) aplicar(id, pl.degradado(), p.id, "ninguno", false);
        paquetes.push({ paquete: p.id, etapa: p.stage, preguntas: Object.keys(preguntas).length, llamada: false, cached: false, ms: 0 });
        return;
      }
      const evidenciaState: Record<string, Array<{ id: string; source: string; value: string; excerpt: string }>> = {};
      for (const [id] of conJev)
        evidenciaState[id] = (porCampo.get(id) ?? []).map((e) => ({
          id: ref(e),
          source: e.source,
          value: String(e.parsed.valor ?? (e.parsed.valores as string[] | undefined)?.join(" or ") ?? ""),
          excerpt: sinDatosPersonales(e.raw).slice(0, 200),
        }));
      const state: EntryType = { listing: { ref: entrada.ref }, ...(entrada.titulo ? { title: sinDatosPersonales(entrada.titulo) } : {}), description: descripcion, evidence: evidenciaState };
      // Si Jev falla tras los reintentos, el error sube: el trabajo se reintenta más tarde con backoff
      // y, en el último intento, el worker usa el modo sin_jev (D-121).
      const res = await limitadorDe(p, o.limitadores ?? LIMITADORES)(() =>
        conReintentos(() => o.jev.ask({ purpose: `sde.${p.id}`, state, questions: preguntas, catalogVersion: catalog.version, signal: o.signal }), o.reintentos ?? REINTENTOS),
      );
      for (const [id, pl] of conJev) aplicar(id, pl.resolver(res.answers), p.id, res.model, res.cached);
      paquetes.push({ paquete: p.id, etapa: p.stage, preguntas: Object.keys(preguntas).length, llamada: true, cached: res.cached, ms: Math.round(performance.now() - t0) });
    }),
  );

  const canonico = CanonicoInmueble.parse({
    schemaVersion: CANONICO_SCHEMA_VERSION,
    ref: entrada.ref,
    catalogVersion: catalog.version,
    procesadoEn: ahora().toISOString(),
    modo,
    campos: { ...campos, ...(o.manuales ?? {}) },
  });
  const unicas = new Map(evidenciasNuevas.map((e) => [e.id, e]));
  return { canonico, revisiones, decisiones, evidenciasNuevas: [...unicas.values()], paquetes: paquetes.sort((a, b) => a.paquete.localeCompare(b.paquete)), modo };
}
