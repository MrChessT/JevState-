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
import { preferenciaVisita } from "@/crm/solicitud";
import { frenteAZona } from "@/portal/estadisticas";
import { calcularHipoteca, precioAsequible } from "@/portal/hipoteca";
import { CARACTERISTICAS_FILTRO, leerFiltros, TIPOS_BUSQUEDA, urlFicha, urlFiltros } from "@/portal/filtros";
import type { RepositorioPortal } from "@/portal/repositorio";
import type { InmuebleResumen } from "@/portal/tipos";
import { euros, numero } from "@/ui/portal/formato";
import { textoCampo } from "@/ui/portal/texto-campo";
import { nombreZona, recomendar, type Candidato, type ResultadoRecomendacion } from "./buscar";
import { ENCAJE_PUNTOS, PREGUNTAS, type Intencion } from "./catalogo";
import { ASSISTANT_CATALOG_VERSION } from "./version";
import { extraer, noEsPrecio, type Extraccion } from "./extraer";
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
  /** Inmueble que el usuario pidió guardar en favoritos (lo guarda la interfaz, en su navegador). */
  guardar?: string;
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
  if (f.banosMin) chips.push({ clave: "banosMin", texto: rellenar(p.chips.banos, { n: f.banosMin }) });
  if (f.m2Min) chips.push({ clave: "m2Min", texto: rellenar(p.chips.m2, { n: f.m2Min }) });
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
  else if (tipo === "banosMin") delete n.banosMin;
  else if (tipo === "m2Min") delete n.m2Min;
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
  if (f.banosMin) params.banos_min = String(f.banosMin);
  if (f.m2Min) params.m2_min = String(f.m2Min);
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
  const paginaPedida = extra.pagina ?? 1;
  const orden = extra.orden ?? "relevancia";
  const todos = await deps.repo.todas();
  const r = recomendar(todos, ficha, 10_000);
  const llamada2 = extra.necesidades && paginaPedida === 1 ? await valorarEncaje(r, ficha, deps) : { llamadas: 0, decisiones: [] };
  const lista = ordenar(r.candidatos, orden);
  // «Ver más» cuando ya se ha visto todo: se dice, no se enseña una página vacía.
  const agotado = paginaPedida > 1 && (paginaPedida - 1) * POR_PAGINA >= lista.length;
  const pagina = agotado ? estado.pagina : paginaPedida;
  const desde = (pagina - 1) * POR_PAGINA;
  const pag = lista.slice(desde, desde + POR_PAGINA);
  const parrafos: string[] = [];
  if (agotado) parrafos.push(rellenar(p.masAgotado, { n: r.total }));
  else if (pagina > 1) parrafos.push(rellenar(p.mas, { m: pag.length, desde: desde + 1, hasta: desde + pag.length, n: r.total }));
  else if (r.total === 0) parrafos.push(p.sinResultados);
  else if (r.relajaciones.length) parrafos.push(rellenar(p.relajado, { cambios: r.relajaciones.map((x) => p.relajacion[x.tipo]).join(locale === "es" ? " y " : " and "), n: r.total }));
  else if (r.total === 1) parrafos.push(p.resultadosUno);
  else parrafos.push(rellenar(p.resultados, { n: r.total, m: pag.length, inmuebles: p.inmuebles[1]! }));
  if (!agotado && pagina === 1 && r.total > 1) {
    const precios = lista.map((c) => c.i.precio).filter((x): x is number => x !== null);
    if (precios.length > 1) parrafos.push(`${rellenar(p.rango, { min: euros(locale, Math.min(...precios)) ?? "", max: euros(locale, Math.max(...precios)) ?? "" })} ${p.ordenado[orden]}`);
  }
  if (pagina === 1 && ficha.zonasAmpliadas.length && !r.relajaciones.some((x) => x.tipo === "colindantes")) parrafos.push(rellenar(p.ampliadas, { zonas: ficha.zonasAmpliadas.map(nombreZona).join(", ") }));
  if (!agotado && pagina === 1 && r.total > 60 && !ficha.zonas.length && !ficha.precioMax && !ficha.precioMin) parrafos.push(p.muyAmplia);
  if (extra.avisos.includes("presupuesto_dudoso") && ficha.precioMax) parrafos.push(rellenar(p.presupuestoDudoso, { precio: euros(locale, ficha.precioMax) ?? "" }));
  // El aviso de modo básico se da una vez (primera búsqueda); después basta la etiqueta del chat.
  if (extra.degradado && !estado.ficha) parrafos.push(p.degradado);
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
  const i = ref ? (await deps.repo.porRefs([ref]))[0] : undefined;
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
  if (a.n > 0) parrafos.push(a.medianaM2 ? rellenar(p.zonaAlquiler, { n: a.n, m2: `${Number(a.medianaM2).toLocaleString(locale === "es" ? "es-ES" : "en-GB", { maximumFractionDigits: 1 })} €` }) : rellenar(p.zonaAlquilerPocos, { n: a.n }));
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

/** Preguntas sobre un inmueble que no son un campo de la ficha: si está bien de precio y qué tiene cerca. */
export function temaDetalle(mensaje: string): "precio_zona" | "cerca" | null {
  const p = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(bien de precio|buen precio|precio justo|esta car[oa]|es car[oa]|es barat[oa]|esta barat[oa]|merece la pena|vale lo que piden|precio de mercado|comparado con la zona|frente a la zona|good (price|deal)|overpriced|fair price|worth (it|the price)|value for money)\b/.test(p)) return "precio_zona";
  if (/\b(que (tiene|hay) cerca|que hay alrededor|alrededores|que tiene al lado|lo que hay cerca|servicios cerca|a cuanto (esta|queda|hay)|what'?s (nearby|around)|what is (nearby|around)|close to what)\b/.test(p)) return "cerca";
  return null;
}

async function detalle(ref: string | null, campo: string | null, estado: EstadoAsistente, locale: Locale, deps: DependenciasMotor, degradado: boolean, tema: "precio_zona" | "cerca" | null = null): Promise<RespuestaAsistente> {
  const p = PLANTILLAS[locale];
  const d = DICCIONARIOS[locale];
  const base = vacia(estado, locale, "detalle_inmueble", [], degradado);
  if (!ref) return { ...base, parrafos: [p.detalleSin] };
  const resumen = (await deps.repo.porRefs([ref]))[0];
  if (!resumen) return { ...base, parrafos: [p.detalleSin] };
  const op = resumen.operacion === "venta" ? "venta" : "alquiler";
  const ficha = await deps.repo.ficha(op, resumen.slug);
  const href = urlFicha(locale, resumen);
  const enlaces = [{ texto: resumen.titulo, href }];
  if (!ficha) return { ...base, parrafos: [p.detalleSin] };
  if (tema === "precio_zona") {
    const municipioPath = ficha.zonaPath.split("/")[0]!;
    const zona = await deps.repo.estadistica(municipioPath, op);
    const pct = frenteAZona(ficha.precio, ficha.superficie, zona.medianaM2);
    if (pct === null || !ficha.precio || !ficha.superficie || !zona.medianaM2) return { ...base, parrafos: [rellenar(p.precioZonaSin, { ref, zona: ficha.municipioNombre })], enlaces };
    const m2 = Math.round(ficha.precio / ficha.superficie);
    const veredicto = pct <= -10 ? p.precioZonaVeredicto.bajo : pct >= 10 ? p.precioZonaVeredicto.alto : p.precioZonaVeredicto.medio;
    return {
      ...base,
      parrafos: [
        rellenar(p.precioZona, { ref, m2: numero(locale, m2), pct: String(Math.abs(pct)), dir: pct < 0 ? p.precioZonaDir.debajo : p.precioZonaDir.encima, zona: ficha.municipioNombre, mediana: numero(locale, Math.round(Number(zona.medianaM2))), n: zona.n }),
        veredicto,
        p.precioZonaAviso,
      ],
      cifras: [
        { etiqueta: locale === "es" ? "Este inmueble" : "This property", valor: `${numero(locale, m2)} €/m²` },
        { etiqueta: locale === "es" ? `Mediana de ${ficha.municipioNombre}` : `${ficha.municipioNombre} median`, valor: `${numero(locale, Math.round(Number(zona.medianaM2)))} €/m²` },
        { etiqueta: locale === "es" ? "Diferencia" : "Difference", valor: `${pct > 0 ? "+" : ""}${pct} %` },
      ],
      enlaces,
    };
  }
  if (tema === "cerca") {
    if (!ficha.distancias.length) return { ...base, parrafos: [rellenar(p.cercaSin, { ref })], enlaces };
    const cats = d.ficha.categorias as Record<string, string>;
    const lineas = [...ficha.distancias].sort((a, b) => a.minutos - b.minutos).slice(0, 6).map((x) => rellenar(p.cercaLinea, { cat: cats[x.categoria] ?? x.categoria, nombre: x.nombre ? ` (${x.nombre})` : "", min: x.minutos, m: numero(locale, x.metros) }));
    return { ...base, parrafos: [rellenar(p.cerca, { ref }), ...lineas, p.cercaAviso], enlaces };
  }
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
  // Una consulta con las fichas completas de las referencias pedidas (sin descargar toda la oferta).
  const fichas = await deps.repo.fichasPorRef([...new Set(refs)].slice(0, 3));
  const elegidos = fichas;
  if (elegidos.length < 2) return vacia(estado, locale, "comparar", [p.compararFaltan], degradado);
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

/** Orden corta escrita sobre los resultados visibles (hasta 7 palabras); null si no lo es. */
export function ordenEscrita(mensaje: string): OrdenAsistente | "mas" | null {
  const p = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¿?¡!.,]/g, " ").trim();
  if (p.split(/\s+/).length > 7) return null;
  if (/^(y\s+)?((ensena|muestra|pon|dame|saca|ver)(me|nos)?\s+)?(mas|otros|otras|siguientes)(\s+(resultados|opciones|pisos|casas|inmuebles))?(\s+por favor)?$|^(show|see|give)\s+(me\s+)?more(\s+\w+)?$|^more(\s+\w+)?$|^next$/.test(p)) return "mas";
  if (!/\b(ordena\w*|ordenar|primero\s+los|sort|order)\b/.test(p)) return null;
  if (/\b(caro|caros|mayor precio|most expensive|highest price)\b/.test(p)) return "precio_desc";
  if (/\b(precio|barato|baratos|cheapest|price)\b/.test(p)) return "precio_asc";
  if (/\b(m2|metro|metros|precio por metro|per m2)\b/.test(p) && /\b(metro|m2)\b/.test(p) && /\bprecio\b/.test(p)) return "m2_asc";
  if (/\b(tamano|grande|grandes|superficie|metros|size|biggest|largest)\b/.test(p)) return "superficie_desc";
  return null;
}

export type ComandoEscrito =
  | { tipo: "mas" }
  | { tipo: "orden"; valor: OrdenAsistente }
  | { tipo: "quitar"; clave: string }
  | { tipo: "operacion"; valor: "venta" | "alquiler" }
  | { tipo: "superlativo"; valor: "barato" | "caro" | "grande" | "pequeno"; orden: OrdenAsistente }
  | { tipo: "guardar"; ref: string };

const QUITAR = /^(y\s+|pero\s+|mejor\s+)?(quita(me|r)?|elimina(r)?|borra(r)?|olvida(te)?( de)?|sin importar|me da igual|da igual|no hace falta|no necesito|remove|drop|forget( about)?|never mind)\b/;

/**
 * Órdenes cortas que no necesitan a Jev: ver más, ordenar, quitar un filtro, cambiar venta/alquiler,
 * «¿cuál es el más barato?» y «guárdalo». Solo con mensajes breves, para no confundir una búsqueda nueva.
 */
export function comandoEscrito(mensaje: string, estado: EstadoAsistente, viendo: string | null): ComandoEscrito | null {
  const p = mensaje.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim();
  const palabras = p.split(" ").length;
  // Guardar: «guárdalo», «el segundo me gusta, guárdalo», «añade FIC-0012 a favoritos».
  if (/\b(guarda(lo|la|me)?|guardalo|guardala|a(n|ñ)ade(lo|la)? a (mis )?favoritos|a favoritos|save (it|this)|add (it )?to (my )?favou?rites)\b/.test(p) && palabras <= 12) {
    const refs = [...mensaje.matchAll(/\b([A-Z]{2,4}-\d{2,6})\b/gi)].map((m) => m[1]!.toUpperCase());
    const ord = Object.entries(ORDINALES_TEXTO).find(([k]) => new RegExp(`\\b(el|la|the)\\s+${k}\\b`).test(p))?.[1];
    const ref = refs[0] ?? (ord !== undefined ? estado.visibles.at(ord > 0 ? ord - 1 : -1)?.ref : undefined) ?? viendo ?? (estado.visibles.length === 1 ? estado.visibles[0]!.ref : undefined);
    if (ref) return { tipo: "guardar", ref };
  }
  if (!estado.ficha || palabras > 8) return null;
  const orden = ordenEscrita(mensaje);
  if (orden === "mas") return { tipo: "mas" };
  if (orden) return { tipo: "orden", valor: orden };
  // «¿Cuál es el más barato?», «el más grande», «which is the cheapest?».
  const sup: Array<[RegExp, "barato" | "caro" | "grande" | "pequeno", OrdenAsistente]> = [
    [/\b(el|la|los|las)\s+mas (barat|economic)|\bcheapest\b|\bleast expensive\b/, "barato", "precio_asc"],
    [/\b(el|la|los|las)\s+mas car[oa]s?\b|\bmost expensive\b/, "caro", "precio_desc"],
    [/\b(el|la|los|las)\s+(mas grande|mas amplio|mas espacioso|con mas metros)|\b(biggest|largest)\b/, "grande", "superficie_desc"],
  ];
  if (!/\b(busco|quiero|queremos|necesito|looking|want)\b/.test(p) && !/\b(algo|uno|otro|something)\s+mas\b/.test(p)) for (const [re, valor, ord] of sup) if (re.test(p)) return { tipo: "superlativo", valor, orden: ord };
  // Cambiar de operación: «ahora en alquiler», «mejor para comprar», «to rent instead».
  if (/^(y |pero |mejor |ahora |y ahora |cambia a |pasa a |cambialo a |lo mismo |lo mismo pero )*(en |de |para )?(alquiler|alquilar|de alquiler|rent|to rent|renting)( en vez| mejor| instead)?$/.test(p) && estado.ficha.operacion !== "alquiler") return { tipo: "operacion", valor: "alquiler" };
  if (/^(y |pero |mejor |ahora |y ahora |cambia a |pasa a |cambialo a |lo mismo |lo mismo pero )*(en |de |para )?(venta|compra|comprar|buy|to buy|buying)( en vez| mejor| instead)?$/.test(p) && estado.ficha.operacion === "alquiler") return { tipo: "operacion", valor: "venta" };
  // Quitar un filtro: «quita el garaje», «me da igual el precio», «remove the pool».
  if (QUITAR.test(p)) {
    const f = estado.ficha;
    const e = extraer(mensaje);
    for (const r of e.requisitos) if (f.requisitos[r.campo]) return { tipo: "quitar", clave: `req:${r.campo}` };
    if (/\bbajo/.test(p) && f.requisitos.planta_baja) return { tipo: "quitar", clave: "req:planta_baja" };
    for (const z of e.zonas) {
      const path = f.zonas.find((x) => z.candidatas.some((c) => c.zona.path === x || x.startsWith(`${c.zona.path}/`)));
      if (path) return { tipo: "quitar", clave: `zona:${path}` };
    }
    for (const t of e.tipos) if (f.tipos.includes(t)) return { tipo: "quitar", clave: `tipo:${t}` };
    for (const x of e.proximidad) if (f.proximidad[x.concepto]) return { tipo: "quitar", clave: `prox:${x.concepto}` };
    if (/\b(precio|presupuesto|limite|budget|price)\b/.test(p) && (f.precioMax || f.precioMin)) return { tipo: "quitar", clave: f.precioMax ? "precioMax" : "precioMin" };
    if (/\b(habitacion|habitaciones|dormitorios?|bedrooms?)\b/.test(p) && f.habMin) return { tipo: "quitar", clave: "habMin" };
    if (/\b(banos?|bathrooms?)\b/.test(p) && f.banosMin) return { tipo: "quitar", clave: "banosMin" };
    if (/\b(metros|m2|superficie|size)\b/.test(p) && f.m2Min) return { tipo: "quitar", clave: "m2Min" };
  }
  return null;
}

const ORDINALES_TEXTO: Record<string, number> = { primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, first: 1, second: 2, third: 3, ultimo: -1, ultima: -1, last: -1 };

export async function responder(entrada: EntradaAsistente, deps: DependenciasMotor): Promise<ResultadoMotor> {
  const { mensaje, opcion, quitar, accion, viendo: refViendo, locale, estado } = EntradaAsistente.parse(entrada);
  const p = PLANTILLAS[locale];
  const viendo = refViendo ? ((await deps.repo.porRefs([refViendo]))[0] ?? null) : null;

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

  // 2b. Órdenes escritas sobre la búsqueda o la lista que ya se ve: las resuelve el código, sin Jev.
  const cmd = comandoEscrito(mensaje, estado, viendo?.ref ?? null);
  if (cmd) {
    if (cmd.tipo === "mas" || cmd.tipo === "orden") return responder({ ...entrada, mensaje: "", accion: cmd.tipo === "mas" ? { tipo: "mas" } : { tipo: "orden", valor: cmd.valor } }, deps);
    if (cmd.tipo === "quitar") return responder({ ...entrada, mensaje: "", quitar: cmd.clave }, deps);
    if (cmd.tipo === "operacion") return responder({ ...entrada, mensaje: "", accion: { tipo: "ajustar", cambios: { operacion: cmd.valor } } }, deps);
    if (cmd.tipo === "superlativo" && estado.ficha) {
      const r = await buscar(estado.ficha, estado, locale, deps, { avisos: [], degradado: false, intencion: "buscar", orden: cmd.orden });
      const primero = r.respuesta.tarjetas[0];
      if (primero) r.respuesta.parrafos = [rellenar(p.superlativo[cmd.valor], { titulo: primero.i.titulo, ref: primero.i.ref, precio: euros(locale, primero.i.precio) ?? "—", m2: primero.i.superficie ? String(primero.i.superficie) : "—" }), ...r.respuesta.parrafos.slice(1)];
      return { respuesta: r.respuesta, decisiones: [], llamadasJev: 0 };
    }
    if (cmd.tipo === "guardar") {
      const i = (await deps.repo.porRefs([cmd.ref]))[0];
      if (i) return { respuesta: { ...vacia(estado, locale, "feedback_resultado", [rellenar(p.guardado, { titulo: i.titulo, ref: i.ref })], false), enlaces: [{ texto: p.verFavoritos, href: ruta(locale, "favoritos") }], guardar: i.ref }, decisiones: [], llamadasJev: 0 };
    }
  }

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

  // «¿Está bien de precio?», «¿qué tiene cerca?» sobre un inmueble concreto: lo responde el código
  // aunque Jev lo clasifique de otra forma (la pregunta no es un campo de la ficha).
  const tema = temaDetalle(mensaje);
  if (tema && interp.inmuebleRef) return fin(await detalle(interp.inmuebleRef, null, estado, locale, deps, degradado, tema));

  // «Tengo X ahorrados y cobro Y al mes»: qué precio se puede permitir (lo calcula el código) y qué hay.
  const ahorros = e.cifras.find((c) => c.pista === "ahorros");
  const ingresos = e.cifras.find((c) => c.pista === "ingresos");
  if ((ahorros || ingresos) && !e.cifras.some((c) => !noEsPrecio(c))) {
    const a = precioAsequible({ ahorros: ahorros?.valor.toString() ?? null, ingresosMes: ingresos?.valor.toString() ?? null, interesAnual: TIPO_INTERES, anos: 30 });
    if (a) {
      const sigue = interp.seguimiento && estado.ficha;
      const ficha = heredar(sigue ? estado.ficha! : fichaVacia(), { ...interp.cambios, operacion: "venta", precioMax: Number(a.precioMax), precioMin: undefined });
      const r = await buscar(ficha, estado, locale, deps, { avisos: [], degradado, intencion: "buscar" });
      const eur = (x: string | number) => euros(locale, Number(x)) ?? "";
      const que = rellenar(ahorros && ingresos ? p.asequibleQue.ambos : ahorros ? p.asequibleQue.ahorros : p.asequibleQue.ingresos, { ahorros: eur(ahorros?.valor.toString() ?? 0), ingresos: eur(ingresos?.valor.toString() ?? 0) });
      const explicacion = [
        rellenar(p.asequible, { que, precio: eur(a.precioMax), prestamo: eur(a.prestamo), cuota: eur(Math.round(Number(a.cuotaMensual))) }),
        ahorros && ingresos ? p.asequibleLimite[a.limitadoPor] : rellenar(p.asequibleFalta[ahorros ? "ingresos" : "ahorros"], { ahorro: eur(a.ahorroNecesario) }),
        p.asequibleAviso,
      ];
      r.respuesta.parrafos.unshift(...explicacion);
      r.respuesta.cifras = [
        { etiqueta: locale === "es" ? "Precio máximo" : "Max. price", valor: eur(a.precioMax) },
        { etiqueta: locale === "es" ? "Cuota mensual" : "Monthly payment", valor: eur(Math.round(Number(a.cuotaMensual))) },
        { etiqueta: locale === "es" ? "Préstamo" : "Loan", valor: eur(a.prestamo) },
      ];
      return fin(r.respuesta, r.llamadas, r.decisiones);
    }
  }

  switch (intencion) {
    case "buscar":
    case "refinar": {
      // Lo que se pidió y no se puede aplicar se dice (nunca se ignora en silencio).
      const avisar = (r: RespuestaAsistente): RespuestaAsistente => {
        const extra: string[] = [];
        if (e.fueraRegion.length) extra.push(rellenar(p.fueraRegion, { lugares: e.fueraRegion.join(locale === "es" ? " y " : " and "), queda: e.fueraRegion.length > 1 ? (locale === "es" ? "quedan" : "are") : locale === "es" ? "queda" : "is" }));
        if (e.noFiltrables.length) extra.push(rellenar(p.noFiltrable, { cosas: e.noFiltrables.map((k) => p.noFiltrables[k]).join(locale === "es" ? " ni " : " or ") }));
        if (extra.length) r.parrafos.splice(Math.min(1, r.parrafos.length), 0, ...extra);
        return r;
      };
      const finAvisos = (r: RespuestaAsistente, extra?: number, mas?: DecisionAsistente[]) => fin(avisar(r), extra, mas);
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
        return finAvisos(r.respuesta, r.llamadas, r.decisiones);
      }
      if (interp.aclarar?.campo === "zona" && !ficha.zonas.length) {
        const opciones = interp.aclarar.opciones;
        return finAvisos({ ...vacia({ ...estado, aclaracion: { campo: "zona", opciones, mensaje, campoPregunta: null } }, locale, "aclarar", [rellenar(p.aclararZona, { literal: interp.aclarar.pregunta })], degradado), opciones });
      }
      if (!fichaTieneCriterios(ficha)) return finAvisos(vacia(estado, locale, intencion, [p.pedirCriterios, ...(degradado ? [p.degradado] : [])], degradado));
      const r = await buscar(ficha, estado, locale, deps, { avisos: interp.avisos, degradado, intencion, necesidades: Boolean(ficha.necesidades) && llamadas < 2, ...(e.pideBarato ? { orden: "precio_asc" as const } : {}) });
      return finAvisos(r.respuesta, r.llamadas, r.decisiones);
    }
    case "detalle_inmueble": {
      if (!interp.inmuebleRef && interp.aclarar?.campo === "inmueble") {
        const opciones = interp.aclarar.opciones;
        return fin({ ...vacia({ ...estado, aclaracion: { campo: "inmueble", opciones, mensaje, campoPregunta: interp.campoPregunta } }, locale, "aclarar", [p.aclararInmueble], degradado), opciones });
      }
      return fin(await detalle(interp.inmuebleRef, interp.campoPregunta, estado, locale, deps, degradado, temaDetalle(mensaje)));
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
    case "contactar_agente": {
      // El asistente prepara la solicitud; la persona la revisa y la envía desde el formulario de la ficha.
      const ref = interp.inmuebleRef ?? viendo?.ref ?? (estado.visibles.length === 1 ? estado.visibles[0]!.ref : null);
      const i = ref ? (await deps.repo.porRefs([ref]))[0] : undefined;
      const visita = intencion === "pedir_visita";
      if (!i) {
        const candidatos = visita ? await deps.repo.porRefs(estado.visibles.slice(0, 4).map((v) => v.ref)) : [];
        const r = vacia(estado, locale, intencion, [candidatos.length ? p.visitaElegir : rellenar(p.contactoGeneral)], degradado);
        r.enlaces.push(...candidatos.map((c) => ({ texto: `${c.titulo} · ref. ${c.ref}`, href: `${urlFicha(locale, c)}?visita=1&origen=asistente#contacto` })));
        return fin(r);
      }
      const pref = preferenciaVisita(mensaje);
      const q = new URLSearchParams({ ...(visita ? { visita: "1" } : {}), ...(visita && pref.fecha ? { fecha: pref.fecha } : {}), ...(visita && pref.franja !== "indiferente" ? { franja: pref.franja } : {}), origen: "asistente" });
      const cuando = pref.fecha ? [new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${pref.fecha}T12:00:00Z`)), p.franjasTexto[pref.franja]].filter(Boolean).join(" ") : null;
      const texto = !visita ? p.contactoBorrador : cuando ? p.visitaBorrador : p.visitaSinFecha;
      const r = vacia(estado, locale, intencion, [rellenar(texto, { titulo: i.titulo, ref: i.ref, cuando: cuando ?? "" })], degradado);
      r.enlaces.push({ texto: p.revisarEnviar, href: `${urlFicha(locale, i)}?${q.toString()}#contacto` });
      return fin(r);
    }
    case "crear_alerta":
    case "valorar_mi_vivienda": {
      const r = vacia(estado, locale, intencion, [rellenar(p.noDisponible[intencion])], degradado);
      const ref = interp.inmuebleRef ?? viendo?.ref;
      const i = ref ? (await deps.repo.porRefs([ref]))[0] : undefined;
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
      const texto = /gracias|thank/.test(plano) ? p.gracias : /como funcion|how do you work|quien eres|who are you|que haces|what do you do|que puedes hacer|que sabes hacer|en que me (puedes )?ayudar|what can you do|how can you help|^ayuda$|^help$/.test(plano.normalize("NFD").replace(/[̀-ͯ]/g, "")) ? rellenar(p.sobreAsistente) : rellenar(p.saludo);
      return fin(vacia(estado, locale, "conversar", [texto], degradado));
    }
  }
}
