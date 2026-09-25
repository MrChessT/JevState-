// Motor del asistente (sección 4): un mensaje → extracción del código → llamada 1 a Jev (entender)
// → puertas y política → acción del código → (llamada 2 opcional: encaje) → respuesta con plantillas.
// Nunca más de 2 llamadas a Jev por mensaje. Si Jev falla o no está configurado, modo degradado
// con palabras clave: la búsqueda sigue funcionando y se avisa.
//
// El estado de la conversación (ficha, inmuebles visibles, aclaración pendiente) viaja con el
// cliente y se valida aquí con zod: no hay sesiones en memoria que se pierdan entre instancias
// serverless (D-207). No contiene datos personales.
import { z } from "zod";
import { CATALOG } from "@/catalog/index";
import { asScore, gateScore } from "@/gates/gate";
import type { Thresholds } from "@/gates/thresholds";
import type { Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import en from "@/i18n/diccionarios/en";
import es from "@/i18n/diccionarios/es";
import { JevError } from "@/jev/errors";
import type { JevPort } from "@/jev/port";
import { sinDatosPersonales } from "@/jev/privacidad";
import { logger } from "@/observability/logger";
import { urlFicha } from "@/portal/filtros";
import type { RepositorioPortal } from "@/portal/repositorio";
import type { InmuebleResumen } from "@/portal/tipos";
import { euros, numero } from "@/ui/portal/formato";
import { textoCampo } from "@/ui/portal/texto-campo";
import { nombreZona, recomendar, type Candidato, type ResultadoRecomendacion } from "./buscar";
import { ENCAJE_PUNTOS, PREGUNTAS, type Intencion } from "./catalogo";
import { ASSISTANT_CATALOG_VERSION } from "./version";
import { extraer, type Extraccion } from "./extraer";
import { FichaBusqueda, fichaTieneCriterios, fichaVacia, heredar, type Chip } from "./ficha";
import { construirPreguntas, interpretarRespuestas, interpretarSinJev, type ContextoMensaje, type DecisionAsistente, type Interpretacion } from "./interpretar";
import { PLANTILLAS, rellenar } from "./respuestas";

const DICCIONARIOS: Record<Locale, Diccionario> = { es, en };

export const Visible = z.object({ ref: z.string().max(40), resumen: z.string().max(200) });
export const Aclaracion = z.object({
  campo: z.enum(["zona", "intencion", "inmueble", "presupuesto"]),
  opciones: z.array(z.object({ valor: z.string().max(120), texto: z.string().max(200) })).max(6),
  /** Mensaje original, para retomarlo cuando el usuario elija. */
  mensaje: z.string().max(1000),
  campoPregunta: z.string().max(60).nullable().default(null),
});
export const EstadoAsistente = z.object({
  ficha: FichaBusqueda.nullable().default(null),
  visibles: z.array(Visible).max(24).default([]),
  aclaracion: Aclaracion.nullable().default(null),
});
export type EstadoAsistente = z.infer<typeof EstadoAsistente>;
export const estadoInicial = (): EstadoAsistente => EstadoAsistente.parse({});

export const EntradaAsistente = z.object({
  mensaje: z.string().trim().max(1000).default(""),
  /** Opción elegida en una aclaración (chip). */
  opcion: z.string().max(120).optional(),
  /** Clave de un chip de la ficha que el usuario quita. */
  quitar: z.string().max(120).optional(),
  /** Ref del inmueble que el usuario está viendo (si pregunta desde una ficha). */
  viendo: z.string().max(40).optional(),
  locale: z.enum(["es", "en"]).default("es"),
  estado: EstadoAsistente.default(estadoInicial()),
});
export type EntradaAsistente = z.input<typeof EntradaAsistente>;

export interface TarjetaAsistente {
  i: InmuebleResumen;
  href: string;
  porque: Array<{ texto: string; tipo: "bueno" | "probable" | "aviso" | "neutro" }>;
}

export interface RespuestaAsistente {
  intencion: Intencion | "editar" | "aclarar";
  parrafos: string[];
  tarjetas: TarjetaAsistente[];
  total: number | null;
  chips: Chip[];
  opciones: Array<{ valor: string; texto: string }>;
  tabla: { columnas: Array<{ ref: string; href: string }>; filas: Array<{ campo: string; valores: string[] }> } | null;
  enlaces: Array<{ texto: string; href: string }>;
  degradado: boolean;
  estado: EstadoAsistente;
}

export interface DependenciasMotor {
  /** null = sin Jev (modo degradado). */
  jev: JevPort | null;
  repo: RepositorioPortal;
  thresholds: Thresholds;
  signal?: AbortSignal;
  /** Aviso de fase: qué va pasando (para el streaming de la UI). */
  progreso?: (fase: "entendiendo" | "buscando" | "valorando" | "respondiendo") => void;
}

export interface ResultadoMotor {
  respuesta: RespuestaAsistente;
  decisiones: DecisionAsistente[];
  llamadasJev: number;
}

// Utilidades ---------------------------------------------------------------------------------

/** Nombre del rasgo para chips y «por qué»: el del diccionario («Luminoso») o el del catálogo. */
const etiquetaCampo = (id: string, locale: Locale) => {
  const r = (DICCIONARIOS[locale].rasgos as Record<string, string>)[id];
  if (r) return r;
  const f = CATALOG.fields.find((x) => x.id === id);
  const t = f ? f.label[locale] : id.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const SITIOS: Record<Locale, Record<string, string>> = {
  es: { playa: "la playa", colegio: "colegios", transporte: "transporte público", sanidad: "centro de salud", comercio: "comercios" },
  en: { playa: "the beach", colegio: "schools", transporte: "public transport", sanidad: "a health centre", comercio: "shops" },
};

/** Descripción en inglés (para las opciones de Jev): solo datos públicos de la tarjeta. */
export function resumenParaJev(i: InmuebleResumen): string {
  return [
    `${i.ref}`,
    i.tipo ?? "property",
    i.habitaciones ? `${i.habitaciones} bedrooms` : null,
    i.superficie ? `${i.superficie} m2` : null,
    i.precio ? `${i.precio} EUR${i.operacion === "venta" ? "" : "/month"}` : null,
    `in ${i.zonaNombre}${i.zonaNombre !== i.municipioNombre ? `, ${i.municipioNombre}` : ""}`,
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 200);
}

function resumenLegible(i: InmuebleResumen, locale: Locale): string {
  const d = DICCIONARIOS[locale];
  return [
    d.tipos[(i.tipo ?? "otro") as keyof typeof d.tipos] ?? i.tipo,
    i.habitaciones ? rellenar(d.tarjeta.hab, { n: i.habitaciones }) : null,
    i.superficie ? `${numero(locale, i.superficie)} m²` : null,
    i.precio ? `${euros(locale, i.precio)}${i.operacion === "venta" ? "" : d.tarjeta.mes}` : null,
    i.zonaNombre,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function chipsDe(f: FichaBusqueda | null, locale: Locale): Chip[] {
  if (!f) return [];
  const p = PLANTILLAS[locale];
  const d = DICCIONARIOS[locale];
  const chips: Chip[] = [];
  if (f.operacion) chips.push({ clave: "operacion", texto: p.chips[f.operacion] });
  for (const z of f.zonas) chips.push({ clave: `zona:${z}`, texto: nombreZona(z), dudoso: f.zonasAmpliadas.includes(z) || undefined });
  for (const t of f.tipos) chips.push({ clave: `tipo:${t}`, texto: d.tipos[t as keyof typeof d.tipos] ?? t });
  if (f.precioMin) chips.push({ clave: "precioMin", texto: rellenar(p.chips.desde, { precio: euros(locale, f.precioMin) ?? "" }) });
  if (f.precioMax) chips.push({ clave: "precioMax", texto: rellenar(p.chips.hasta, { precio: euros(locale, f.precioMax) ?? "" }) });
  if (f.habMin) chips.push({ clave: "habMin", texto: rellenar(p.chips.hab, { n: f.habMin }) });
  for (const [campo, nivel] of Object.entries(f.requisitos)) {
    if (campo === "planta_baja") chips.push({ clave: `req:${campo}`, texto: p.chips.sinBajos });
    else {
      const rasgo = etiquetaCampo(campo, locale);
      chips.push({ clave: `req:${campo}`, texto: rellenar(p.chips[nivel], { rasgo: nivel === "rechazo" ? rasgo.toLowerCase() : rasgo }) });
    }
  }
  for (const c of Object.keys(f.proximidad)) chips.push({ clave: `prox:${c}`, texto: rellenar(p.chips.cerca, { sitio: SITIOS[locale][c] ?? c }) });
  if (f.prioridad && p.prioridades[f.prioridad]) chips.push({ clave: "prioridad", texto: rellenar(p.chips.prioridad, { p: p.prioridades[f.prioridad]! }) });
  if (f.perfil && p.perfiles[f.perfil]) chips.push({ clave: "perfil", texto: p.perfiles[f.perfil]! });
  return chips;
}

/** Quita un chip de la ficha (edición directa, sin Jev). */
export function quitarChip(f: FichaBusqueda, clave: string): FichaBusqueda {
  const [tipo, valor] = clave.includes(":") ? [clave.slice(0, clave.indexOf(":")), clave.slice(clave.indexOf(":") + 1)] : [clave, ""];
  const n: FichaBusqueda = structuredClone(f);
  if (tipo === "operacion") delete n.operacion;
  else if (tipo === "zona") {
    n.zonas = n.zonas.filter((z) => z !== valor);
    n.zonasAmpliadas = n.zonasAmpliadas.filter((z) => z !== valor);
  } else if (tipo === "tipo") n.tipos = n.tipos.filter((t) => t !== valor);
  else if (tipo === "precioMax") delete n.precioMax;
  else if (tipo === "precioMin") delete n.precioMin;
  else if (tipo === "habMin") delete n.habMin;
  else if (tipo === "req") delete n.requisitos[valor];
  else if (tipo === "prox") delete n.proximidad[valor];
  else if (tipo === "prioridad") delete n.prioridad;
  else if (tipo === "perfil") delete n.perfil;
  return FichaBusqueda.parse(n);
}

function porQue(c: Candidato, ficha: FichaBusqueda, locale: Locale): TarjetaAsistente["porque"] {
  const p = PLANTILLAS[locale].porque;
  const out: TarjetaAsistente["porque"] = [];
  const zona = c.zonaComparada ?? c.i.municipioNombre;
  if (c.frenteZona !== null) {
    if (c.frenteZona <= -3) out.push({ texto: rellenar(p.bajoMediana, { pct: Math.abs(c.frenteZona), zona }), tipo: "bueno" });
    else if (c.frenteZona >= 3) out.push({ texto: rellenar(p.sobreMediana, { pct: c.frenteZona, zona }), tipo: "neutro" });
    else out.push({ texto: rellenar(p.enMediana, { zona }), tipo: "neutro" });
  }
  for (const campo of c.deseablesCumplidos) out.push({ texto: rellenar(p.tiene, { rasgo: etiquetaCampo(campo, locale) }), tipo: "bueno" });
  for (const campo of c.deseablesProbables) out.push({ texto: rellenar(p.probable, { rasgo: etiquetaCampo(campo, locale) }), tipo: "probable" });
  for (const [campo, nivel] of Object.entries(ficha.requisitos))
    if (nivel === "imprescindible" && campo !== "planta_baja") {
      const r = c.i.rasgos.find((x) => x.campo === campo);
      if (r) out.push({ texto: rellenar(r.status === "confirmado" ? p.tiene : p.probable, { rasgo: etiquetaCampo(campo, locale) }), tipo: r.status === "confirmado" ? "bueno" : "probable" });
    }
  if (c.sobrePresupuesto) out.push({ texto: rellenar(p.sobrePresupuesto, { pct: c.sobrePresupuesto.toLocaleString(locale === "es" ? "es-ES" : "en-GB") }), tipo: "aviso" });
  if (ficha.zonasAmpliadas.some((z) => c.i.zonaPath === z || c.i.zonaPath.startsWith(`${z}/`))) out.push({ texto: rellenar(p.zonaAmpliada, { zona: c.i.zonaNombre }), tipo: "aviso" });
  if (c.encaje !== undefined) out.push({ texto: c.encaje >= 0.5 ? p.encajeAlto : p.encajeBajo, tipo: c.encaje >= 0.5 ? "bueno" : "neutro" });
  const dias = Math.floor((Date.now() - Date.parse(c.i.publicadoEn)) / 86_400_000);
  if (out.length < 2 && dias >= 0 && dias <= 14) out.push({ texto: rellenar(p.nuevo, { dias }), tipo: "neutro" });
  // Sin duplicados y como mucho 4 motivos: la tarjeta tiene que leerse de un vistazo.
  return out.filter((x, i, a) => a.findIndex((y) => y.texto === x.texto) === i).slice(0, 4);
}

/** Solo los campos de la tarjeta: el repositorio en memoria devuelve la ficha completa. */
export function soloResumen(i: InmuebleResumen): InmuebleResumen {
  const { id, ref, slug, operacion, tipo, titulo, zonaPath, zonaNombre, municipioNombre, precio, precioAnterior, superficie, habitaciones, banos, plantaTipo, lat, lon, foto, rasgos, publicadoEn, ficticio } = i;
  return { id, ref, slug, operacion, tipo, titulo, zonaPath, zonaNombre, municipioNombre, precio, precioAnterior, superficie, habitaciones, banos, plantaTipo, lat, lon, foto, rasgos, publicadoEn, ficticio };
}

function vacia(estado: EstadoAsistente, locale: Locale, intencion: RespuestaAsistente["intencion"], parrafos: string[], degradado: boolean): RespuestaAsistente {
  return { intencion, parrafos, tarjetas: [], total: null, chips: chipsDe(estado.ficha, locale), opciones: [], tabla: null, enlaces: [], degradado, estado };
}

// Llamada 2: encaje con las necesidades en texto libre (sección 4.4) --------------------------

async function valorarEncaje(r: ResultadoRecomendacion, ficha: FichaBusqueda, deps: DependenciasMotor): Promise<{ llamadas: number; decisiones: DecisionAsistente[] }> {
  if (!deps.jev || !ficha.necesidades || r.candidatos.length < 2) return { llamadas: 0, decisiones: [] };
  const top = r.candidatos.slice(0, 6);
  const questions = Object.fromEntries(top.map((c) => [`encaje_${c.i.ref.toLowerCase().replace(/-/g, "_")}`, PREGUNTAS.encaje(c.i.ref).pregunta]));
  const state = {
    user_needs: sinDatosPersonales(ficha.necesidades),
    properties: Object.fromEntries(top.map((c) => [c.i.ref, { summary: resumenParaJev(c.i), features: c.i.rasgos.map((x) => `${x.campo} (${x.status})`).join(", ") || "none stated" }])),
  };
  deps.progreso?.("valorando");
  try {
    const res = await deps.jev.ask({ purpose: "asistente.juzgar", state, questions, catalogVersion: ASSISTANT_CATALOG_VERSION, signal: deps.signal });
    const decisiones: DecisionAsistente[] = [];
    for (const c of top) {
      const id = `encaje_${c.i.ref.toLowerCase().replace(/-/g, "_")}`;
      const a = asScore(res.answers[id]);
      if (!a) continue;
      const g = gateScore(a, deps.thresholds.encaje, ENCAJE_PUNTOS.length);
      decisiones.push({ id, gate: "encaje", outcome: g.outcome, elegido: g.level, confianza: g.confidence });
      if (g.outcome === "preguntar") continue;
      c.encaje = ENCAJE_PUNTOS[g.level]!;
      c.puntos += c.encaje * 1.5;
    }
    top.sort((a, b) => b.puntos - a.puntos || a.i.ref.localeCompare(b.i.ref));
    r.candidatos.splice(0, top.length, ...top);
    return { llamadas: 1, decisiones };
  } catch (e) {
    if (e instanceof JevError) {
      logger.warn("asistente.jev_fallo", { proposito: "asistente.juzgar", codigo: e.code, detalle: e.message.slice(0, 200) });
      return { llamadas: 1, decisiones: [] }; // sin encaje: se queda el preorden del código
    }
    throw e;
  }
}

// Acciones -----------------------------------------------------------------------------------

async function buscar(ficha0: FichaBusqueda, estado: EstadoAsistente, locale: Locale, deps: DependenciasMotor, extra: { avisos: string[]; degradado: boolean; intencion: RespuestaAsistente["intencion"]; necesidades?: boolean }) {
  const p = PLANTILLAS[locale];
  deps.progreso?.("buscando");
  // Sin operación indicada se busca en venta, y se muestra como chip para que se pueda cambiar.
  const ficha: FichaBusqueda = { ...ficha0, operacion: ficha0.operacion ?? "venta" };
  const efectivaBase = ficha;
  const todos = await deps.repo.todas();
  const r = recomendar(todos, efectivaBase, 12);
  const llamada2 = extra.necesidades ? await valorarEncaje(r, ficha, deps) : { llamadas: 0, decisiones: [] };
  const parrafos: string[] = [];
  if (r.total === 0) parrafos.push(p.sinResultados);
  else if (r.relajaciones.length) parrafos.push(rellenar(p.relajado, { cambios: r.relajaciones.map((x) => p.relajacion[x.tipo]).join(locale === "es" ? " y " : " and "), n: r.total }));
  else if (r.total === 1) parrafos.push(p.resultadosUno);
  else parrafos.push(rellenar(p.resultados, { n: r.total, m: Math.min(r.total, r.candidatos.length), inmuebles: p.inmuebles[1]! }));
  if (ficha.zonasAmpliadas.length && !r.relajaciones.some((x) => x.tipo === "colindantes")) parrafos.push(rellenar(p.ampliadas, { zonas: ficha.zonasAmpliadas.map(nombreZona).join(", ") }));
  if (extra.avisos.includes("presupuesto_dudoso") && ficha.precioMax) parrafos.push(rellenar(p.presupuestoDudoso, { precio: euros(locale, ficha.precioMax) ?? "" }));
  if (extra.degradado) parrafos.push(p.degradado);
  const tarjetas = r.candidatos.map((c) => ({ i: soloResumen(c.i), href: urlFicha(locale, c.i), porque: porQue(c, r.fichaEfectiva, locale) }));
  const nuevoEstado: EstadoAsistente = { ficha, visibles: r.candidatos.map((c) => ({ ref: c.i.ref, resumen: resumenParaJev(c.i) })), aclaracion: null };
  const respuesta: RespuestaAsistente = {
    intencion: extra.intencion,
    parrafos,
    tarjetas,
    total: r.total,
    chips: chipsDe(ficha, locale),
    opciones: [],
    tabla: null,
    enlaces: [],
    degradado: extra.degradado,
    estado: nuevoEstado,
  };
  void estado;
  return { respuesta, llamadas: llamada2.llamadas, decisiones: llamada2.decisiones };
}

async function detalle(ref: string | null, campo: string | null, estado: EstadoAsistente, locale: Locale, deps: DependenciasMotor, degradado: boolean): Promise<RespuestaAsistente> {
  const p = PLANTILLAS[locale];
  const d = DICCIONARIOS[locale];
  const base = vacia(estado, locale, "detalle_inmueble", [], degradado);
  if (!ref) return { ...base, parrafos: [p.detalleSin] };
  const resumen = (await deps.repo.todas()).find((i) => i.ref === ref);
  if (!resumen) return { ...base, parrafos: [p.detalleSin] };
  const op = resumen.operacion === "venta" ? "venta" : "alquiler";
  const ficha = await deps.repo.ficha(op, resumen.slug);
  const href = urlFicha(locale, resumen);
  const enlaces = [{ texto: resumen.titulo, href }];
  if (!ficha) return { ...base, parrafos: [p.detalleSin] };
  if (!campo || campo === "no_consta") return { ...base, parrafos: [rellenar(p.detalleGeneral, { ref, resumen: resumenLegible(resumen, locale) })], enlaces };
  const c = ficha.campos[campo];
  const valor = textoCampo(campo, c, locale, d);
  const etiqueta = CATALOG.fields.find((f) => f.id === campo)?.label[locale] ?? campo;
  if (!c || valor === null) return { ...base, parrafos: [rellenar(p.detalleNoConsta, { ref, campo: etiqueta.toLowerCase() })], enlaces: [{ texto: d.ficha.noConstaPregunta, href: `${href}?campo=${campo}#contacto` }, ...enlaces] };
  return { ...base, parrafos: [rellenar(p.detalleValor, { ref, campo: etiqueta, valor, estado: p.estado[c.status] })], enlaces };
}

const CAMPOS_COMPARAR = ["precio", "superficie_construida", "habitaciones", "banos", "planta", "estado", "terraza", "ascensor", "garaje", "piscina", "gastos_comunidad", "certificado_energetico"];

async function comparar(refs: string[], estado: EstadoAsistente, locale: Locale, deps: DependenciasMotor, degradado: boolean): Promise<RespuestaAsistente> {
  const p = PLANTILLAS[locale];
  const d = DICCIONARIOS[locale];
  const todos = await deps.repo.todas();
  const elegidos = [...new Set(refs)].map((r) => todos.find((i) => i.ref === r)).filter((i): i is InmuebleResumen => Boolean(i)).slice(0, 3);
  if (elegidos.length < 2) return vacia(estado, locale, "comparar", [p.compararFaltan], degradado);
  const fichas = await Promise.all(elegidos.map((i) => deps.repo.ficha(i.operacion === "venta" ? "venta" : "alquiler", i.slug)));
  const filas = CAMPOS_COMPARAR.map((campo) => ({
    campo: CATALOG.fields.find((f) => f.id === campo)?.label[locale] ?? campo,
    valores: fichas.map((f) => (f ? (textoCampo(campo, f.campos[campo], locale, d) ?? "—") : "—")),
  })).filter((f) => f.valores.some((v) => v !== "—"));
  return { ...vacia(estado, locale, "comparar", [p.comparar], degradado), tabla: { columnas: elegidos.map((i) => ({ ref: i.ref, href: urlFicha(locale, i) })), filas } };
}

// Entrada ------------------------------------------------------------------------------------

function contexto(estado: EstadoAsistente, viendo: InmuebleResumen | null): ContextoMensaje {
  return { ficha: estado.ficha, visibles: estado.visibles, viendo: viendo ? { ref: viendo.ref, resumen: resumenParaJev(viendo) } : null, aclaracion: estado.aclaracion ? { campo: estado.aclaracion.campo, opciones: estado.aclaracion.opciones.map((o) => o.valor) } : null };
}

async function entender(mensaje: string, e: Extraccion, ctx: ContextoMensaje, deps: DependenciasMotor): Promise<{ interp: Interpretacion; llamadas: number }> {
  if (!deps.jev) return { interp: interpretarSinJev(e, ctx, mensaje), llamadas: 0 };
  const { preguntas } = construirPreguntas(e, ctx);
  deps.progreso?.("entendiendo");
  const state = {
    message: sinDatosPersonales(mensaje),
    context: {
      page: ctx.viendo ? `listing ${ctx.viendo.ref}` : "assistant",
      search: ctx.ficha ? JSON.stringify({ ...ctx.ficha, necesidades: undefined, descartados: undefined, pesos: undefined }) : "none",
      visible: ctx.visibles.slice(0, 6).map((v) => v.resumen).join(" | ") || "none",
      draft: "none",
    },
  };
  try {
    const res = await deps.jev.ask({ purpose: "asistente.entender", state, questions: preguntas, catalogVersion: ASSISTANT_CATALOG_VERSION, signal: deps.signal });
    return { interp: interpretarRespuestas(e, ctx, res.answers, deps.thresholds), llamadas: 1 };
  } catch (err) {
    if (err instanceof JevError && err.code !== "aborted") {
      logger.warn("asistente.jev_fallo", { proposito: "asistente.entender", codigo: err.code, detalle: err.message.slice(0, 200) });
      return { interp: interpretarSinJev(e, ctx, mensaje), llamadas: 1 };
    }
    throw err;
  }
}

const AJUSTES_FEEDBACK: Record<string, Partial<FichaBusqueda>> = {
  luz: { pesos: { luminosidad: 1.5, exterior: 0.5 } },
  precio: { prioridad: "precio" },
  tamano: { prioridad: "espacio" },
  estado: { prioridad: "estado" },
};

export async function responder(entrada: EntradaAsistente, deps: DependenciasMotor): Promise<ResultadoMotor> {
  const { mensaje, opcion, quitar, viendo: refViendo, locale, estado } = EntradaAsistente.parse(entrada);
  const p = PLANTILLAS[locale];
  const todos = refViendo || opcion ? await deps.repo.todas() : [];
  const viendo = refViendo ? (todos.find((i) => i.ref === refViendo) ?? null) : null;

  // 1. Edición de chips: la resuelve el código, sin Jev.
  if (quitar && estado.ficha) {
    const ficha = quitarChip(estado.ficha, quitar);
    if (!fichaTieneCriterios(ficha)) return { respuesta: { ...vacia({ ...estado, ficha: null, visibles: [] }, locale, "editar", [p.pedirCriterios], false) }, decisiones: [], llamadasJev: 0 };
    const r = await buscar(ficha, estado, locale, deps, { avisos: [], degradado: false, intencion: "editar" });
    return { respuesta: r.respuesta, decisiones: [], llamadasJev: 0 };
  }

  // 2. Respuesta a una aclaración con chips: también la resuelve el código.
  if (opcion && estado.aclaracion) {
    const a = estado.aclaracion;
    const elegida = a.opciones.find((o) => o.valor === opcion);
    if (elegida) {
      if (a.campo === "zona") {
        const e = extraer(a.mensaje);
        const interp = interpretarSinJev(e, contexto(estado, viendo), a.mensaje);
        const ficha = heredar(estado.ficha ?? fichaVacia(), { ...interp.cambios, zonas: [opcion] });
        const r = await buscar(ficha, estado, locale, deps, { avisos: [], degradado: false, intencion: "buscar" });
        return { respuesta: r.respuesta, decisiones: [], llamadasJev: 0 };
      }
      if (a.campo === "inmueble") return { respuesta: await detalle(opcion, a.campoPregunta, { ...estado, aclaracion: null }, locale, deps, false), decisiones: [], llamadasJev: 0 };
      if (a.campo === "intencion") return ejecutar(opcion as Intencion, a.mensaje, extraer(a.mensaje), null, { ...estado, aclaracion: null }, viendo, locale, deps, 0, []);
    }
  }

  if (!mensaje) return { respuesta: vacia(estado, locale, "conversar", [p.saludo], false), decisiones: [], llamadasJev: 0 };

  // 3. Mensaje normal: extracción → llamada 1 → puertas.
  const e = extraer(mensaje);
  const ctx = contexto(estado, viendo);
  const { interp, llamadas } = await entender(mensaje, e, ctx, deps);
  return ejecutar(interp.intencion, mensaje, e, interp, estado, viendo, locale, deps, llamadas, interp.decisiones);
}

async function ejecutar(
  intencion: Intencion,
  mensaje: string,
  e: Extraccion,
  interp0: Interpretacion | null,
  estado: EstadoAsistente,
  viendo: InmuebleResumen | null,
  locale: Locale,
  deps: DependenciasMotor,
  llamadas: number,
  decisiones: DecisionAsistente[],
): Promise<ResultadoMotor> {
  const p = PLANTILLAS[locale];
  const interp = interp0 ?? { ...interpretarSinJev(e, contexto(estado, viendo), mensaje), intencion, degradado: false, avisos: [] };
  const degradado = interp.degradado;
  const fin = (respuesta: RespuestaAsistente, extra = 0, masDecisiones: DecisionAsistente[] = []): ResultadoMotor => ({ respuesta, decisiones: [...decisiones, ...masDecisiones], llamadasJev: llamadas + extra });

  if (interp.inyeccion) return fin(vacia(estado, locale, "fuera_de_ambito", [p.inyeccion], degradado));

  // Aclaración de intención (una cosa por turno, con chips).
  if (interp.aclarar?.campo === "intencion" && interp0) {
    const opciones = interp.aclarar.opciones.map((o) => ({ valor: o.valor, texto: p.intenciones[o.valor] ?? o.valor }));
    return fin({ ...vacia({ ...estado, aclaracion: { campo: "intencion", opciones, mensaje, campoPregunta: null } }, locale, "aclarar", [p.aclararIntencion], degradado), opciones });
  }

  switch (intencion) {
    case "buscar":
    case "refinar": {
      const sigue = intencion === "refinar" || interp.seguimiento;
      const necesidades = e.textoLibre ? sinDatosPersonales(mensaje).slice(0, 300) : undefined;
      const ficha = heredar(sigue && estado.ficha ? estado.ficha : fichaVacia(), { ...interp.cambios, necesidades });
      if (interp.aclarar?.campo === "zona" && !ficha.zonas.length) {
        const opciones = interp.aclarar.opciones;
        return fin({ ...vacia({ ...estado, aclaracion: { campo: "zona", opciones, mensaje, campoPregunta: null } }, locale, "aclarar", [rellenar(p.aclararZona, { literal: interp.aclarar.pregunta })], degradado), opciones });
      }
      if (!fichaTieneCriterios(ficha)) return fin(vacia(estado, locale, intencion, [p.pedirCriterios, ...(degradado ? [p.degradado] : [])], degradado));
      const r = await buscar(ficha, estado, locale, deps, { avisos: interp.avisos, degradado, intencion, necesidades: Boolean(ficha.necesidades) && llamadas < 2 });
      return fin(r.respuesta, r.llamadas, r.decisiones);
    }
    case "detalle_inmueble": {
      if (!interp.inmuebleRef && interp.aclarar?.campo === "inmueble") {
        const opciones = interp.aclarar.opciones;
        return fin({ ...vacia({ ...estado, aclaracion: { campo: "inmueble", opciones, mensaje, campoPregunta: interp.campoPregunta } }, locale, "aclarar", [p.aclararInmueble], degradado), opciones });
      }
      return fin(await detalle(interp.inmuebleRef, interp.campoPregunta, estado, locale, deps, degradado));
    }
    case "comparar": {
      const refs = e.inmuebles.refs.length >= 2 ? e.inmuebles.refs : [...e.inmuebles.refs, ...(viendo ? [viendo.ref] : []), ...(e.inmuebles.refs.length ? [] : estado.visibles.slice(0, 2).map((v) => v.ref))];
      return fin(await comparar(refs, estado, locale, deps, degradado));
    }
    case "feedback_resultado": {
      const ref = interp.inmuebleRef ?? viendo?.ref ?? estado.visibles[0]?.ref ?? null;
      const motivo = interp.feedbackMotivo ?? "otro";
      if (motivo === "gustado") return fin(vacia(estado, locale, intencion, [p.feedbackGustado], degradado));
      if (!estado.ficha) return fin(vacia(estado, locale, intencion, [p.pedirCriterios], degradado));
      const ficha = heredar(estado.ficha, { ...(AJUSTES_FEEDBACK[motivo] ?? {}), descartados: ref ? [ref] : [] });
      const r = await buscar(ficha, estado, locale, deps, { avisos: [], degradado, intencion });
      r.respuesta.parrafos.unshift(rellenar(p.feedbackAjuste, { ajuste: p.feedbackAjustes[motivo as keyof typeof p.feedbackAjustes] || p.feedbackAjustes.otro }));
      return fin(r.respuesta, r.llamadas, r.decisiones);
    }
    case "pedir_visita":
    case "contactar_agente":
    case "crear_alerta":
    case "valorar_mi_vivienda": {
      const r = vacia(estado, locale, intencion, [rellenar(p.noDisponible[intencion])], degradado);
      const ref = interp.inmuebleRef ?? viendo?.ref;
      const i = ref ? (await deps.repo.todas()).find((x) => x.ref === ref) : undefined;
      if (i && intencion !== "valorar_mi_vivienda") r.enlaces.push({ texto: i.titulo, href: `${urlFicha(locale, i)}#contacto` });
      return fin(r);
    }
    case "fuera_de_ambito":
      return fin(vacia(estado, locale, intencion, [rellenar(p.fueraDeAmbito)], degradado));
    default: {
      const plano = mensaje.toLowerCase();
      const texto = /gracias|thank/.test(plano) ? p.gracias : /como funcion|how do you work|quien eres|who are you|que haces|what do you do/.test(plano.normalize("NFD").replace(/[̀-ͯ]/g, "")) ? rellenar(p.sobreAsistente) : rellenar(p.saludo);
      return fin(vacia(estado, locale, "conversar", [texto], degradado));
    }
  }
}
