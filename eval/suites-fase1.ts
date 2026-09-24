// Suites sin Jev de la fase 1: normalizadores, zonas, proximidad y pipeline sobre los 300 ficticios.
import Decimal from "decimal.js";
import { extraerCertificado } from "../src/extraccion/varios";
import { extraerBanos, extraerDormitorios } from "../src/extraccion/estancias";
import { extraerImportes } from "../src/extraccion/importes";
import { extraerPlanta } from "../src/extraccion/planta";
import { extraerProximidad } from "../src/extraccion/proximidad";
import { extraerSuperficies } from "../src/extraccion/superficies";
import { generarConjunto, feedXml, type ValorVerdad } from "../src/ficticios/generador";
import { hashContenido } from "../src/ingesta/tipos";
import { parsearFeedXml } from "../src/ingesta/xml-portales";
import { FakeJev } from "../src/jev/fake";
import type { JevPort } from "../src/jev/port";
import { AlmacenMemoria } from "../src/pipeline/almacen";
import { procesarRegistro } from "../src/pipeline/procesar";
import { buscarZonas } from "../src/zonas/buscar";
import { GeocoderLocal } from "../src/zonas/geocodificar";
import type { CompiledCatalog } from "../src/catalog/schema";
import { CASOS_NORMALIZADORES } from "./datasets/normalizadores";
import { CASOS_PROXIMIDAD } from "./datasets/proximidad";
import { casosZonas } from "./datasets/zonas";
import type { CaseResult, Suite } from "./framework";
import { oraculo } from "../src/ficticios/oraculo";

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const normalizadores: Suite = {
  id: "normalizadores",
  description: "Extracción sin Jev: precios, superficies, habitaciones, baños, planta y certificado.",
  async run() {
    return CASOS_NORMALIZADORES.map((c, i): CaseResult => {
      let obtenido: unknown;
      if (c.tipo === "importe") obtenido = extraerImportes(c.texto).map((x) => [x.valor.toString(), x.contexto]);
      else if (c.tipo === "superficie") obtenido = extraerSuperficies(c.texto).map((x) => [x.m2.toString(), x.tipo]);
      else if (c.tipo === "dormitorios") obtenido = extraerDormitorios(c.texto)[0]?.n ?? null;
      else if (c.tipo === "banos") obtenido = extraerBanos(c.texto)[0]?.n ?? null;
      else if (c.tipo === "planta") {
        const p = extraerPlanta(c.texto)[0];
        obtenido = p ? [p.numero, p.tipo] : null;
      } else obtenido = extraerCertificado(c.texto)[0]?.valor ?? null;
      const ok = igual(obtenido, c.esperado);
      // Una cifra que no estaba en el texto sería un dato inventado.
      const inventado = c.tipo === "importe" && Array.isArray(obtenido) && (obtenido as string[][]).some(([v]) => !c.texto.replace(/\D/g, "").includes(v!.replace(/0+$/, "")) && !/mil|k\b|m€|millon|cincuenta|doscientos/i.test(c.texto));
      return { id: `${c.tipo}#${i}: ${c.texto}`, ok, invented: inventado, detail: ok ? undefined : `esperado ${JSON.stringify(c.esperado)}, obtenido ${JSON.stringify(obtenido)}`, etiquetas: [c.tipo] };
    });
  },
};

export const zonas: Suite = {
  id: "zonas",
  description: "Zonas con erratas, alias y variantes (top-1 dentro de las rutas aceptables).",
  async run() {
    return casosZonas().map((c): CaseResult => {
      const top = buscarZonas(c.consulta, { limite: 3 })[0]?.zona.path;
      const ok = top !== undefined && c.esperado.includes(top);
      return { id: `${c.variante}: ${c.consulta}`, ok, detail: ok ? undefined : `esperado ${c.esperado.join(" | ")}, obtenido ${top ?? "nada"}`, etiquetas: [c.variante] };
    });
  },
};

export const proximidad: Suite = {
  id: "proximidad",
  description: "Conceptos de proximidad (playa, colegio, transporte, sanidad, comercio).",
  async run() {
    return CASOS_PROXIMIDAD.map((c): CaseResult => {
      const obtenido = extraerProximidad(c.texto).map((x) => x.concepto);
      const ok = igual(obtenido, c.esperado);
      return { id: c.texto, ok, detail: ok ? undefined : `esperado ${c.esperado.join(",")}, obtenido ${obtenido.join(",")}` };
    });
  },
};

function normalizar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) return new Decimal(v).toString();
  return String(v);
}

/** Pipeline completo sobre los ficticios, comparado campo a campo con la verdad. */
export function suitePipeline(id: string, descripcion: string, crearJev: (verdades: Map<string, Record<string, ValorVerdad>>, catalog: CompiledCatalog) => JevPort, opciones: { modo?: "normal" | "sin_jev"; n?: number } = {}): Suite {
  return {
    id,
    description: descripcion,
    requiresJev: id.endsWith("-jev"),
    async run({ catalog, jev: jevReal }) {
      const inmuebles = generarConjunto(opciones.n ?? 300);
      const verdades = new Map(inmuebles.map((i) => [i.ref, i.verdad]));
      const paginas = new Map(inmuebles.filter((i) => i.html).map((i) => [i.ref, i.html!]));
      const registros = parsearFeedXml(feedXml(inmuebles), { adaptador: "ficticios", capturadoEn: "2026-09-24T00:00:00Z", ficticio: true }).map((r) => (paginas.has(r.ref) ? { ...r, html: paginas.get(r.ref)! } : r));
      const jev = jevReal ?? crearJev(verdades, catalog);
      const almacen = new AlmacenMemoria();
      const casos: CaseResult[] = [];
      const escenarios = new Map(inmuebles.map((i) => [i.ref, i.escenarios]));
      for (const r of registros) {
        const res = await procesarRegistro(r, hashContenido(r), { jev, catalog, geocoder: new GeocoderLocal(), almacen, agencyId: "eval", modo: opciones.modo, limitadores: new Map(), reintentos: { intentos: 2, baseMs: 200, maxMs: 1000 } });
        const verdad = verdades.get(r.ref)!;
        const campos = res.cascada!.canonico.campos;
        const idsEvidencia = new Set(res.evidencias!.map((e) => e.id));
        for (const [campo, t] of Object.entries(verdad)) {
          const c = campos[campo];
          if (!c) continue;
          const v = normalizar(c.value);
          const esperado = normalizar(t);
          const afirmado = v !== null;
          const correcto = v === esperado;
          const sinEvidencia = afirmado && c.method !== "manual" && !c.evidenceIds.every((x) => idsEvidencia.has(x));
          const inventado = (afirmado && esperado === null) || sinEvidencia;
          const etiquetas = [afirmado ? "afirmado" : "no_consta", correcto ? "correcto" : "incorrecto"];
          if (afirmado && !correcto && c.status === "confirmado") etiquetas.push("error_confirmado");
          if (!afirmado && esperado !== null) etiquetas.push("perdido");
          if (c.status === "revisar" || c.status === "probable") etiquetas.push(`estado_${c.status}`);
          casos.push({
            id: `${r.ref}.${campo}`,
            ok: correcto,
            invented: inventado,
            detail: correcto ? undefined : `verdad ${esperado ?? "no consta"}, sistema ${v ?? "no consta"} (${c.status}, ${c.method}${c.nota ? `: ${c.nota}` : ""}) [${(escenarios.get(r.ref) ?? []).join(",")}]`,
            etiquetas,
          });
        }
      }
      return casos;
    },
  };
}

export const pipelineOraculo = suitePipeline("pipeline-oraculo", "300 ficticios con un Jev oráculo: mide extracción, cascada y puertas.", (v, c) => new FakeJev({ responder: oraculo(v, c) }));
export const pipelineSinJev = suitePipeline("pipeline-sin-jev", "300 ficticios sin Jev (degradado): nada inventado, lo dudoso a revisión.", () => new FakeJev(), { modo: "sin_jev" });
export const pipelineJev50 = suitePipeline("pipeline-jev", "50 ficticios etiquetados con Jev real.", () => new FakeJev(), { n: 50 });
