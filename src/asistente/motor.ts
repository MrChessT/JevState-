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
import { ruta, type Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import en from "@/i18n/diccionarios/en";
import es from "@/i18n/diccionarios/es";
import { JevError } from "@/jev/errors";
import type { JevPort } from "@/jev/port";
import { sinDatosPersonales } from "@/jev/privacidad";
import { logger } from "@/observability/logger";
import { calcularHipoteca } from "@/portal/hipoteca";
import { CARACTERISTICAS_FILTRO, leerFiltros, TIPOS_BUSQUEDA, urlFicha, urlFiltros } from "@/portal/filtros";
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
export const ORDENES_ASISTENTE = ["relevancia", "precio_asc", "precio_desc", "m2_asc", "superficie_desc"] as const;
export type OrdenAsistente = (typeof ORDENES_ASISTENTE)[number];

export const EstadoAsistente = z.object({
  ficha: FichaBusqueda.nullable().default(null),
  visibles: z.array(Visible).max(24).default([]),
  aclaracion: Aclaracion.nullable().default(null),
  pagina: z.number().int().min(1).max(50).default(1),
  orden: z.enum(ORDENES_ASISTENTE).default("relevancia"),
});
export type EstadoAsistente = z.infer<typeof EstadoAsistente>;
export const estadoInicial = (): EstadoAsistente => EstadoAsistente.parse({});

/**
 * Acciones de un clic (sugerencias y botones de las tarjetas). Las resuelve el código, sin Jev: el
 * usuario ya ha elegido exactamente qué quiere.
 */
export const AccionAsistente = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ajustar"), cambios: FichaBusqueda.partial() }),
  z.object({ tipo: z.literal("mas") }),
  z.object({ tipo: z.literal("quitar"), clave: z.string().max(120) }),
  z.object({ tipo: z.literal("orden"), valor: z.enum(ORDENES_ASISTENTE) }),
  z.object({ tipo: z.literal("zona"), path: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)?$/) }),
  z.object({ tipo: z.literal("hipoteca"), ref: z.string().max(40).optional(), precio: z.number().positive().max(1e8).optional(), anos: z.number().int().min(5).max(40).default(30), entradaPct: z.number().int().min(0).max(80).default(20) }),
]);
export type AccionAsistente = z.infer<typeof AccionAsistente>;

export const EntradaAsistente = z.object({
  /** Acción de un clic (sugerencia o botón de tarjeta). */
  accion: AccionAsistente.optional(),
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
  /** Siguientes pasos de un clic, generados por el código a partir de la ficha y el resultado. */
  sugerencias: Array<{ texto: string; accion: z.input<typeof AccionAsistente> }>;
  /** Datos destacados (hipoteca, zona) para mostrarlos como cifras grandes. */
  cifras: Array<{ etiqueta: string; valor: string }>;
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
  return { intencion, parrafos, tarjetas: [], total: null, chips: chipsDe(estado.ficha, locale), opciones: [], tabla: null, enlaces: [], sugerencias: [], cifras: [], degradado, estado };
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

const POR_PAGINA = 12;
const RASGOS_SUGERIBLES = ["terraza", "garaje", "piscina", "ascensor", "trastero"];

function ordenar(lista: Candidato[], orden: OrdenAsistente): Candidato[] {
  if (orden === "relevancia") return lista;
  const val = (c: Candidato) => {
    const i = c.i;
    if (orden === "precio_asc") return i.precio ?? Infinity;
    if (orden === "precio_desc") return -(i.precio ?? 0);
    if (orden === "m2_asc") return i.precio && i.superficie ? i.precio / i.superficie : Infinity;
    return -(i.superficie ?? 0);
  };
  return [...lista].sort((a, b) => val(a) - val(b) || a.i.ref.localeCompare(b.i.ref));
}

/** URL del buscador clásico con los mismos criterios (solo si caben en sus filtros). */
function urlPortal(f: FichaBusqueda, locale: Locale): string | null {
  if (f.zonas.length > 1) return null;
  const con = Object.entries(f.requisitos).filter(([c, n]) => n !== "rechazo" && (CARACTERISTICAS_FILTRO as readonly string[]).includes(c)).map(([c]) => c);
  const tipos = f.tipos.filter((t) => (TIPOS_BUSQUEDA as readonly string[]).includes(t));
  const params: Record<string, string> = {};
  if (f.precioMax) params.precio_max = String(Math.round(f.precioMax));
  if (f.precioMin) params.precio_min = String(Math.round(f.precioMin));
  if (f.habMin) params.hab_min = String(f.habMin);
  if (tipos.length) params.tipo = tipos.join(",");
  if (con.length) params.con = con.join(",");
  return urlFiltros(locale, leerFiltros(f.operacion ?? "venta", f.zonas[0]?.split("/"), params));
}

function sugerenciasBusqueda(f: FichaBusqueda, total: number, mostrados: number, orden: OrdenAsistente, locale: Locale): RespuestaAsistente["sugerencias"] {
  const p = PLANTILLAS[locale].sugerencias;
  const out: RespuestaAsistente["sugerencias"] = [];
  // Sin resultados: proponer aflojar, nunca añadir más filtros.
  if (total === 0) {
    if (f.precioMax) {
      const subir = Math.round((f.precioMax * 1.25) / (f.operacion === "alquiler" ? 50 : 5000)) * (f.operacion === "alquiler" ? 50 : 5000);
      out.push({ texto: rellenar(p.subir, { precio: euros(locale, subir) ?? "" }), accion: { tipo: "ajustar", cambios: { precioMax: subir } } });
    }
    for (const c of chipsDe(f, locale).filter((c) => c.clave !== "operacion" && !c.clave.startsWith("zona:") && c.clave !== "precioMax"))
      out.push({ texto: rellenar(p.quitar, { x: c.texto }), accion: { tipo: "quitar", clave: c.clave } });
    return out.slice(0, 5);
  }
  if (total > mostrados) out.push({ texto: rellenar(p.mas, { n: Math.min(POR_PAGINA, total - mostrados) }), accion: { tipo: "mas" } });
  if (total > 1 && orden !== "precio_asc") out.push({ texto: p.baratos, accion: { tipo: "orden", valor: "precio_asc" } });
  if (total > 1 && f.operacion !== "alquiler" && orden !== "m2_asc") out.push({ texto: p.m2, accion: { tipo: "orden", valor: "m2_asc" } });
  if (f.precioMax && total > 3) {
    const bajar = Math.round((f.precioMax * 0.85) / 5000) * 5000;
    if (bajar > 0) out.push({ texto: rellenar(p.bajar, { precio: euros(locale, bajar) ?? "" }), accion: { tipo: "ajustar", cambios: { precioMax: bajar } } });
  }
  for (const r of RASGOS_SUGERIBLES.filter((c) => !f.requisitos[c]).slice(0, 2))
    out.push({ texto: rellenar(p.con, { rasgo: etiquetaCampo(r, locale).toLowerCase() }), accion: { tipo: "ajustar", cambios: { requisitos: { [r]: "imprescindible" } } } });
  if (f.zonas.length === 1) out.push({ texto: rellenar(p.zona, { zona: nombreZona(f.zonas[0]!) }), accion: { tipo: "zona", path: f.zonas[0]! } });
  out.push(f.operacion === "alquiler" ? { texto: p.venta, accion: { tipo: "ajustar", cambios: { operacion: "venta" } } } : { texto: p.alquiler, accion: { tipo: "ajustar", cambios: { operacion: "alquiler" } } });
  return out.slice(0, 6);
}

async function buscar(
  ficha0: FichaBusqueda,
  estado: EstadoAsistente,
  locale: Locale,
  deps: DependenciasMotor,
  extra: { avisos: string[]; degradado: boolean; intencion: RespuestaAsistente["intencion"]; necesidades?: boolean; pagina?: number; orden?: OrdenAsistente },
) {
  const p = PLANTILLAS[locale];
  deps.progreso?.("buscando");
  // Sin operación indicada se busca en venta, y se muestra como chip para que se pueda cambiar.
  const ficha: FichaBusqueda = { ...ficha0, operacion: ficha0.operacion ?? "venta" };
  const pagina = extra.pagina ?? 1;
  const orden = extra.orden ?? "relevancia";
  const todos = await deps.repo.todas();
  const r = recomendar(todos, ficha, 10_000);
  const llamada2 = extra.necesidades && pagina === 1 ? await valorarEncaje(r, ficha, deps) : { llamadas: 0, decisiones: [] };
  const lista = ordenar(r.candidatos, orden);
  const desde = (pagina - 1) * POR_PAGINA;
  const pag = lista.slice(desde, desde + POR_PAGINA);
  const parrafos: string[] = [];
  if (pagina > 1) parrafos.push(rellenar(p.mas, { m: pag.length, desde: desde + 1, hasta: desde + pag.length, n: r.total }));
  else if (r.total === 0) parrafos.push(p.sinResultados);
  else if (r.relajaciones.length) parrafos.push(rellenar(p.relajado, { cambios: r.relajaciones.map((x) => p.relajacion[x.tipo]).join(locale === "es" ? " y " : " and "), n: r.total }));
  else if (r.total === 1) parrafos.push(p.resultadosUno);
  else parrafos.push(rellenar(p.resultados, { n: r.total, m: pag.length, inmuebles: p.inmuebles[1]! }));
  if (pagina === 1 && r.total > 1) {
    const precios = lista.map((c) => c.i.precio).filter((x): x is number => x !== null);
    if (precios.length > 1) parrafos.push(`${rellenar(p.rango, { min: euros(locale, Math.min(...precios)) ?? "", max: euros(locale, Math.max(...precios)) ?? "" })}} ${p.ordenado[orden]}`);
  }
  if (pagina === 1 && ficha.zonasAmpliadas.length && !r.relajaciones.some((x) => x.tipo === "colindantes")) parrafos.push(rellenar(p.ampliadas, { zonas: ficha.zonasAmpliadas.map(nombreZona).join(", ") }));
  if (extra.avisos.includes("presupuesto_dudoso") && ficha.precioMax) parrafos.push(rellenar(p.presupuestoDudoso, { precio: euros(locale, ficha.precioMax) ?? "" }));
  if (extra.degradado) parrafos.push(p.degradado);
  const tarjetas = pag.map((c) => ({ i: soloResumen(c.i), href: urlFicha(locale, c.i), porque: porQue(c, r.fichaEfectiva, locale) }));
  const visibles = [...(pagina > 1 ? estado.visibles : []), ...pag.map((c) => ({ ref: c.i.ref, resumen: resumenParaJev(c.i) }))].slice(-24);
  const nuevoEstado: EstadoAsistente = { ficha, visibles, aclaracion: null, pagina, orden };
  const portal = urlPortal(ficha, locale);
  const respuesta: RespuestaAsistente = {
    intencion: extra.intencion,
    parrafos,
    tarjetas,
    total: r.total,
    chips: chipsDe(ficha, locale),
    opciones: [],
    tabla: null,
    enlaces: portal && r.total > 0 ? [{ texto: p.sugerencias.portal, href: portal }] : [],
    sugerencias: sugerenciasBusqueda(ficha, r.total, desde + pag.length, orden, locale),
    cifras: [],
    degradado: extra.degradado,
    estado: nuevoEstado,
  };
  return { respuesta, llamadas: llamada2.llamadas, decisiones: llamada2.decisiones };
}

// Hipoteca orientativa (el código calcula; Jev solo entiende que se pide).
const TIPO_INTERES = "3";

async function hipoteca(ref: string | null, precio0: number | null, anos: number, entradaPct: number, estado: EstadoAsistente, locale: Locale, deps: DependenciasMotor, degradado: boolean): Promise<RespuestaAsistente> {
  const p = PLANTILLAS[locale];
  const base = vacia(estado, locale, "calcular_hipoteca", [], degradado);
  const i = ref ? (await deps.repo.todas()).find((x) => x.ref === ref) : undefined;
  if (i && i.operacion !== "venta") return { ...base, parrafos: [rellenar(p.hipotecaAlquiler, { ref: i.ref, precio: euros(locale, i.precio) ?? "—" })] };
  const precio = i?.precio ?? precio0;
  if (!precio) return { ...base, parrafos: [p.hipotecaSin] };
  const h = calcularHipoteca({ precio: String(precio), entradaPct: String(entradaPct), interesAnual: TIPO_INTERES, anos, gastosPct: "10" });
  const cuota = euros(locale, Math.round(Number(h.cuotaMensual))) ?? "";
  const que = i ? `${i.ref} (${euros(locale, precio)})` : locale === "es" ? `un precio de ${euros(locale, precio)}` : `a price of ${euros(locale, precio)}`;
  const s = p.sugerencias;
  const accion = (cambios: { anos?: number; entradaPct?: number }) => ({ tipo: "hipoteca" as const, ref: i?.ref, precio: i ? undefined : precio, anos: cambios.anos ?? anos, entradaPct: cambios.entradaPct ?? entradaPct });
  return {
    ...base,
    parrafos: [
      rellenar(p.hipoteca, { que, precio: euros(locale, precio) ?? "", entrada: entradaPct, anos, tipo: TIPO_INTERES, cuota }),
      rellenar(p.hipotecaAhorro, { ahorro: euros(locale, Number(h.ahorroNecesario)) ?? "", intereses: euros(locale, Number(h.totalIntereses)) ?? "" }),
      p.hipotecaAviso,
    ],
    cifras: [
      { etiqueta: locale === "es" ? "Cuota mensual" : "Monthly payment", valor: cuota },
      { etiqueta: locale === "es" ? "Préstamo" : "Loan", valor: euros(locale, Number(h.prestamo)) ?? "" },
      { etiqueta: locale === "es" ? "Ahorro necesario" : "Savings needed", valor: euros(locale, Number(h.ahorroNecesario)) ?? "" },
    ],
    sugerencias: [
      ...(anos !== 25 ? [{ texto: s.cuota25, accion: accion({ anos: 25 }) }] : []),
      ...(anos !== 35 ? [{ texto: s.cuota35, accion: accion({ anos: 35 }) }] : []),
      ...(entradaPct !== 30 ? [{ texto: s.entrada30, accion: accion({ entradaPct: 30 }) }] : []),
      ...(entradaPct !== 10 ? [{ texto: s.entrada10, accion: accion({ entradaPct: 10 }) }] : []),
    ],
    enlaces: i ? [{ texto: i.titulo, href: urlFicha(locale, i) }] : [],
  };
}

async function infoZona(path: string | null, estado: EstadoAsistente, locale: Locale, deps: DependenciasMotor, degradado: boolean): Promise<RespuestaAsistente> {
  const p = PLANTILLAS[locale];
  const base = vacia(estado, locale, "info_zona", [], degradado);
  if (!path) return { ...base, parrafos: [p.zonaSin] };
  const nombre = nombreZona(path);
  const [v, a] = await Promise.all([deps.repo.estadistica(path, "venta"), deps.repo.estadistica(path, "alquiler")]);
  if (v.n === 0 && a.n === 0) return { ...base, parrafos: [rellenar(p.zonaSinDatos, { zona: nombre })] };
  const e = (x: string | null) => (x ? (euros(locale, Number(x)) ?? "—") : "—");
  const num = (x: string | null) => (x ? numero(locale, Math.round(Number(x))) : "—");
  const parrafos: string[] = [];
  if (v.n > 0) parrafos.push(rellenar(p.zona, { zona: nombre, n: v.n, m2: e(v.medianaM2), p25: num(v.p25M2), p75: num(v.p75M2) }));
  if (a.n > 0) parrafos.push(rellenar(p.zonaAlquiler, { n: a.n, m2: a.medianaM2 ? `${Number(a.medianaM2).toLocaleString(locale === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 1 })} €` : "—" }));
  parrafos.push(p.zonaFuente);
  const s = p.sugerencias;
  return {
    ...base,
    parrafos,
    cifras: [
      ...(v.n > 0 ? [{ etiqueta: locale === "es" ? "Mediana venta" : "Median sale", valor: `${e(v.medianaM2)}/m²` }, { etiqueta: locale === "es" ? "En venta" : "For sale", valor: String(v.n) }] : []),
      ...(a.n > 0 ? [{ etiqueta: locale === "es" ? "En alquiler" : "For rent", valor: String(a.n) }] : []),
    ],
    sugerencias: [
      ...(v.n > 0 ? [{ texto: rellenar(s.buscarZona, { zona: nombre }), accion: { tipo: "ajustar" as const, cambios: { zonas: [path], operacion: "venta" as const } } }] : []),
      ...(a.n > 0 ? [{ texto: `${s.alquiler} · ${nombre}`, accion: { tipo: "ajustar" as const, cambios: { zonas: [path], operacion: "alquiler" as const } } }] : []),
    ],
    enlaces: [{ texto: nombre, href: ruta(locale, "zonas", ...path.split("/")) }],
  };
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
  const { mensaje, opcion, quitar, accion, viendo: refViendo, locale, estado } = EntradaAsistente.parse(entrada);
  const p = PLANTILLAS[locale];
  const todos = refViendo || opcion ? await deps.repo.todas() : [];
  const viendo = refViendo ? (todos.find((i) => i.ref === refViendo) ?? null) : null;

  // 0. Acciones de un clic: las resuelve el código, sin Jev.
  if (accion) {
    const sin = { avisos: [], degradado: false };
    const fin = (respuesta: RespuestaAsistente): ResultadoMotor => ({ respuesta, decisiones: [], llamadasJev: 0 });
    if (accion.tipo === "zona") return fin(await infoZona(accion.path, estado, locale, deps, false));
    if (accion.tipo === "hipoteca") return fin(await hipoteca(accion.ref ?? null, accion.precio ?? null, accion.anos, accion.entradaPct, estado, locale, deps, false));
    if (accion.tipo === "ajustar") {
      const base = estado.ficha ?? fichaVacia();
      const heredada = heredar(base, accion.cambios);
      // Cambiar de venta a alquiler (o al revés) invalida el presupuesto: son escalas distintas.
      const cambiaOperacion = accion.cambios.operacion && accion.cambios.operacion !== (base.operacion ?? "venta");
      const ficha = FichaBusqueda.parse(cambiaOperacion ? { ...heredada, precioMax: undefined, precioMin: undefined } : heredada);
      if (!fichaTieneCriterios(ficha)) return fin(vacia(estado, locale, "editar", [p.pedirCriterios], false));
      return fin((await buscar(ficha, estado, locale, deps, { ...sin, intencion: "editar" })).respuesta);
    }
    if (estado.ficha) {
      if (accion.tipo === "quitar") {
        const ficha = quitarChip(estado.ficha, accion.clave);
        if (!fichaTieneCriterios(ficha)) return fin(vacia({ ...estado, ficha: null, visibles: [] }, locale, "editar", [p.pedirCriterios], false));
        return fin((await buscar(ficha, estado, locale, deps, { ...sin, intencion: "editar" })).respuesta);
      }
      if (accion.tipo === "mas") return fin((await buscar(estado.ficha, estado, locale, deps, { ...sin, intencion: "buscar", pagina: estado.pagina + 1, orden: estado.orden })).respuesta);
      if (accion.tipo === "orden") return fin((await buscar(estado.ficha, estado, locale, deps, { ...sin, intencion: "buscar", orden: accion.valor })).respuesta);
    }
    return fin(vacia(estado, locale, "conversar", [p.pedirCriterios], false));
  }

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
      let ficha = heredar(sigue && estado.ficha ? estado.ficha : fichaVacia(), { ...interp.cambios, necesidades });
      // «Algo más barato» / «más grande»: petición relativa a la búsqueda anterior, la calcula el código.
      if (e.relativo && estado.ficha) {
        const antes = ficha.precioMax;
        if (e.relativo === "barato" && antes && !interp.cambios.precioMax) ficha = { ...ficha, precioMax: Math.round((antes * 0.85) / 1000) * 1000 };
        const orden: OrdenAsistente = e.relativo === "barato" ? "precio_asc" : "superficie_desc";
        const r = await buscar(ficha, estado, locale, deps, { avisos: interp.avisos, degradado, intencion, orden });
        const pr = PLANTILLAS[locale];
        r.respuesta.parrafos.unshift(e.relativo === "grande" ? pr.relativoGrande : ficha.precioMax !== antes ? rellenar(pr.relativoBarato, { precio: euros(locale, ficha.precioMax!) ?? "" }) : pr.relativoBaratoSin);
        return fin(r.respuesta, r.llamadas, r.decisiones);
      }
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
    case "calcular_hipoteca": {
      const ref = interp.inmuebleRef ?? viendo?.ref ?? null;
      // Aquí «hipoteca» junto a la cifra no la convierte en cuota: se pregunta por el precio a financiar.
      const cifra = e.cifras.find((c) => c.valor.gte(10_000))?.valor.toNumber() ?? interp.cambios.precioMax ?? null;
      return fin(await hipoteca(ref, ref ? null : cifra, 30, 20, estado, locale, deps, degradado));
    }
    case "info_zona": {
      const path = interp.cambios.zonas?.[0] ?? e.zonas.map((z) => z.candidatas[0]).find((c) => c && c.score >= 0.9)?.zona.path ?? (estado.ficha?.zonas.length === 1 ? estado.ficha.zonas[0]! : null);
      return fin(await infoZona(path, estado, locale, deps, degradado));
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
