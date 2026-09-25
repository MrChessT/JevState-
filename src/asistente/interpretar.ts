// Llamada 1 (sección 4.2): solo se pregunta lo que el mensaje puede contestar. Las respuestas pasan
// por las puertas con la política de la acción (4.3). Si Jev no está disponible, interpretación
// degradada con el código (4.1: «la búsqueda funciona con filtros del código y los chips»).
import type { Questions } from "@typesafe-ai/sdk";
import { CATALOG } from "@/catalog/index";
import { asChoice, asNoul, gateChoice, gateNoul, type GateOutcome } from "@/gates/gate";
import { ACCION_DE_INTENCION, POLITICAS, umbral, type Accion } from "@/gates/policy";
import type { GateKey, Thresholds } from "@/gates/thresholds";
import type { JevAnswer } from "@/jev/port";
import { PREGUNTAS, type Intencion, type PreguntaCatalogo } from "./catalogo";
import type { Extraccion } from "./extraer";
import type { FichaBusqueda } from "./ficha";

export interface ContextoMensaje {
  /** Ficha vigente (si hay conversación previa). */
  ficha: FichaBusqueda | null;
  /** Inmuebles visibles (tarjetas mostradas, en orden) y el que se está viendo. */
  visibles: Array<{ ref: string; resumen: string }>;
  viendo: { ref: string; resumen: string } | null;
  /** Aclaración pendiente (la respuesta la resuelve el código, sin Jev). */
  aclaracion: { campo: string; opciones: string[] } | null;
}

export interface DecisionAsistente {
  id: string;
  gate: GateKey;
  outcome: GateOutcome;
  elegido: string | number | boolean | null;
  confianza: number;
}

export interface Interpretacion {
  intencion: Intencion;
  accion: Accion | null;
  /** Qué hay que aclarar antes de actuar (una cosa por turno, con chips). */
  aclarar: { campo: "zona" | "intencion" | "inmueble" | "presupuesto"; pregunta: string; opciones: Array<{ valor: string; texto: string }> } | null;
  cambios: Partial<FichaBusqueda>;
  seguimiento: boolean;
  inmuebleRef: string | null;
  campoPregunta: string | null;
  feedbackMotivo: string | null;
  inyeccion: boolean;
  /** Avisos para el usuario («He buscado en Murcia y Cartagena»). */
  avisos: string[];
  decisiones: DecisionAsistente[];
  degradado: boolean;
}

export function construirPreguntas(e: Extraccion, ctx: ContextoMensaje): { preguntas: Questions; mapa: Record<string, PreguntaCatalogo> } {
  const mapa: Record<string, PreguntaCatalogo> = {};
  mapa.intencion = PREGUNTAS.intencion();
  mapa.ambiguo = PREGUNTAS.ambiguo();
  mapa.inyeccion = PREGUNTAS.inyeccion();
  if (e.operacion || /compr|alquil|rent|buy/i.test(JSON.stringify(e))) mapa.operacion = PREGUNTAS.operacion();
  e.zonas.forEach((z) => {
    mapa[z.id] = PREGUNTAS.zona(z.literal, z.candidatas.map((c) => ({ clave: c.zona.path.replace(/\//g, "__").replace(/-/g, "_"), descripcion: `${c.zona.nombre} (${c.zona.nivel === "municipio" ? "municipality" : `neighbourhood of ${c.zona.nombreMunicipio}`}, Region of Murcia)` })));
  });
  if (e.tipos.length) mapa.tipo = PREGUNTAS.tipo();
  e.cifras.forEach((c) => {
    mapa[`presupuesto_ok_${c.id}`] = PREGUNTAS.presupuesto_ok(`${c.valor.toString()} EUR`, c.literal);
  });
  if (e.cifras.length) mapa.presupuesto_tipo = PREGUNTAS.presupuesto_tipo(`${e.cifras[0]!.valor.toString()} EUR`);
  e.requisitos.forEach((r) => (mapa[r.id] = PREGUNTAS.requisito(r.literal)));
  e.proximidad.forEach((x) => (mapa[x.id] = PREGUNTAS.proximidad(x.literal)));
  if (e.textoLibre) mapa.prioridad = PREGUNTAS.prioridad();
  if (e.perfilDeclarado) mapa.perfil_declarado = PREGUNTAS.perfil_declarado();
  const candidatos = [...(ctx.viendo ? [ctx.viendo] : []), ...ctx.visibles].filter((v, i, a) => a.findIndex((x) => x.ref === v.ref) === i).slice(0, 12);
  const hablaDeInmueble = e.inmuebles.refs.length > 0 || e.inmuebles.ordinal !== null || e.inmuebles.deictico || ctx.viendo !== null;
  if (hablaDeInmueble && (candidatos.length || e.inmuebles.refs.length))
    mapa.campo_pregunta = PREGUNTAS.campo_pregunta(CATALOG.fields.filter((f) => f.public && f.type !== "text").map((f) => ({ clave: f.id, descripcion: f.label.en })));
  if (candidatos.length && hablaDeInmueble) {
    mapa.inmueble_ref = PREGUNTAS.inmueble_ref(candidatos.map((c, i) => ({ clave: c.ref.toLowerCase().replace(/-/g, "_"), descripcion: `${ctx.viendo?.ref === c.ref ? "The property the user is viewing now" : `Result ${i + (ctx.viendo ? 0 : 1)}`}: ${c.resumen}` })));
  }
  if (ctx.visibles.length) mapa.feedback_motivo = PREGUNTAS.feedback_motivo();
  if (ctx.ficha) mapa.seguimiento = PREGUNTAS.seguimiento();
  return { preguntas: Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, v.pregunta])), mapa };
}

const desdeClave = (k: string) => k.replace(/__/g, "/").replace(/_/g, "-");

export function interpretarRespuestas(e: Extraccion, ctx: ContextoMensaje, answers: Record<string, JevAnswer | undefined>, t: Thresholds): Interpretacion {
  const decisiones: DecisionAsistente[] = [];
  const reg = (id: string, gate: GateKey, outcome: GateOutcome, elegido: DecisionAsistente["elegido"], confianza: number) => decisiones.push({ id, gate, outcome, elegido, confianza });
  const avisos: string[] = [];
  const cambios: Partial<FichaBusqueda> = {};

  // Inyección: «sí» es alarma; por encima del umbral no se actúa.
  const iny = asNoul(answers.inyeccion);
  const inyeccion = iny ? gateNoul(iny, t.inyeccion) === "preguntar" : false;
  if (iny) reg("inyeccion", "inyeccion", inyeccion ? "preguntar" : "actuar", inyeccion, iny.noul);

  const ai = asChoice(answers.intencion);
  let intencion: Intencion = "conversar";
  let aclarar: Interpretacion["aclarar"] = null;
  if (ai) {
    const accion0 = ACCION_DE_INTENCION[ai.choice] ?? null;
    const g = gateChoice(ai, accion0 ? t[POLITICAS[accion0].umbralIntencion] : t.intencion_lectura);
    reg("intencion", accion0 ? POLITICAS[accion0].umbralIntencion : "intencion_lectura", g.outcome, g.choice, g.confidence);
    intencion = g.choice as Intencion;
    if (g.outcome === "preguntar") {
      const top = g.ranked.slice(0, 3).filter((r) => r.option !== "fuera_de_ambito");
      aclarar = { campo: "intencion", pregunta: "intencion", opciones: top.map((r) => ({ valor: r.option, texto: r.option })) };
    }
  }
  const accion = ACCION_DE_INTENCION[intencion] ?? null;

  // Seguimiento: hereda lo no dicho.
  const seg = asNoul(answers.seguimiento);
  const seguimiento = seg ? gateNoul(seg, t.seguimiento) !== "preguntar" : false;
  if (seg) reg("seguimiento", "seguimiento", seguimiento ? "actuar" : "preguntar", seguimiento, seg.noul);

  const op = asChoice(answers.operacion);
  if (op && op.choice !== "no_indicado" && gateChoice(op, t.operacion).outcome !== "preguntar") cambios.operacion = op.choice === "compra" ? "venta" : "alquiler";
  else if (e.operacion) cambios.operacion = e.operacion;

  // Zonas: con duda razonable se amplía a las 2 más probables y se avisa (política buscar).
  const zonas: string[] = [];
  const ampliadas: string[] = [];
  for (const z of e.zonas) {
    const a = asChoice(answers[z.id]);
    if (!a) continue;
    const literal = z.candidatas.some((c) => c.literal);
    const g = gateChoice(a, umbral(t, "zona", accion, { literal }));
    reg(z.id, "zona", g.outcome, g.choice, g.confidence);
    if (g.choice === "ninguna") continue;
    const top2 = g.ranked.filter((r) => r.option !== "varias" && r.option !== "ninguna").slice(0, 2);
    // Política de buscar ante la duda: si dos zonas concentran casi toda la probabilidad, se buscan
    // las dos y se avisa, en vez de preguntar.
    const ampliable = accion === "buscar" && top2.length === 2 && top2[0]!.probability + top2[1]!.probability >= 0.7;
    if (g.choice === "varias" || g.outcome === "confirmar" || (g.outcome === "preguntar" && ampliable)) {
      const dos = g.ranked.filter((r) => r.option !== "varias" && r.option !== "ninguna").slice(0, 2).map((r) => desdeClave(r.option));
      zonas.push(...dos);
      ampliadas.push(...dos.slice(1));
    } else if (g.outcome === "actuar") zonas.push(desdeClave(g.choice));
    else if (!aclarar) aclarar = { campo: "zona", pregunta: z.literal, opciones: z.candidatas.slice(0, 3).map((c) => ({ valor: c.zona.path, texto: c.zona.nivel === "barrio" ? `${c.zona.nombre} (${c.zona.nombreMunicipio})` : c.zona.nombre })) };
  }
  if (zonas.length) cambios.zonas = [...new Set(zonas)];
  if (ampliadas.length) cambios.zonasAmpliadas = ampliadas;

  const tipo = asChoice(answers.tipo);
  if (tipo && tipo.choice !== "no_indicado" && gateChoice(tipo, t.tipo).outcome !== "preguntar") cambios.tipos = [tipo.choice];
  else if (e.tipos.length === 1) cambios.tipos = e.tipos;

  // Presupuesto: cifra que Jev confirma como precio; tipo (máximo, mínimo, aproximado…).
  const tipoP = asChoice(answers.presupuesto_tipo);
  for (const c of e.cifras) {
    const a = asNoul(answers[`presupuesto_ok_${c.id}`]);
    if (!a) continue;
    const out = gateNoul(a, t.presupuesto_ok);
    reg(`presupuesto_ok_${c.id}`, "presupuesto_ok", out, c.valor.toNumber(), a.noul);
    if (out === "preguntar") continue;
    const clase = tipoP && gateChoice(tipoP, t.presupuesto_tipo).outcome !== "preguntar" ? tipoP.choice : c.pista === "minimo" ? "minimo" : "maximo";
    if (clase === "cuota_mensual") continue; // una cuota no es un precio: no se filtra por ella
    if (clase === "minimo") cambios.precioMin = c.valor.toNumber();
    else {
      cambios.precioMax = c.valor.toNumber();
      if (clase === "aproximado") cambios.tolerancia = 10;
    }
    if (out === "confirmar") avisos.push("presupuesto_dudoso");
  }
  if (e.habitaciones !== null) cambios.habMin = e.habitaciones;

  // Requisitos y proximidad.
  const requisitos: Record<string, "imprescindible" | "deseable" | "rechazo"> = {};
  for (const r of e.requisitos) {
    const a = asChoice(answers[r.id]);
    const g = a ? gateChoice(a, t.requisito) : null;
    if (g) reg(r.id, "requisito", g.outcome, g.choice, g.confidence);
    const nivel = g && g.outcome !== "preguntar" && g.choice !== "no_aplica" ? g.choice : r.negado ? "rechazo" : "deseable";
    if (g?.choice === "no_aplica") continue;
    requisitos[r.campo] = nivel as "imprescindible" | "deseable" | "rechazo";
  }
  if (e.sinBajos) requisitos.planta_baja = "rechazo";
  if (Object.keys(requisitos).length) cambios.requisitos = requisitos;
  const proximidad: Record<string, "muy_cerca" | "cerca"> = {};
  for (const x of e.proximidad) {
    const a = asChoice(answers[x.id]);
    const g = a ? gateChoice(a, t.proximidad) : null;
    if (g && g.choice !== "indiferente" && g.outcome !== "preguntar") proximidad[x.concepto] = g.choice as "muy_cerca" | "cerca";
    else if (!g) proximidad[x.concepto] = "cerca";
  }
  if (Object.keys(proximidad).length) cambios.proximidad = proximidad;

  const pr = asChoice(answers.prioridad);
  if (pr && pr.choice !== "no_indicado" && gateChoice(pr, t.prioridad).outcome !== "preguntar") cambios.prioridad = pr.choice;
  // Perfil: solo declarado; con duda se ignora (nunca se pregunta ni se infiere).
  const pf = asChoice(answers.perfil_declarado);
  if (pf && pf.choice !== "no_declarado" && gateChoice(pf, t.perfil_declarado).outcome === "actuar") cambios.perfil = pf.choice;

  // Inmueble mencionado y campo preguntado.
  let inmuebleRef: string | null = null;
  const ir = asChoice(answers.inmueble_ref);
  if (ir) {
    const g = gateChoice(ir, umbral(t, "inmueble_ref", accion));
    reg("inmueble_ref", "inmueble_ref", g.outcome, g.choice, g.confidence);
    if (g.choice !== "ninguno" && g.outcome !== "preguntar") inmuebleRef = g.choice.toUpperCase().replace(/_/g, "-");
    else if (accion === "detalle_inmueble" && !aclarar && ctx.visibles.length)
      aclarar = { campo: "inmueble", pregunta: "inmueble", opciones: ctx.visibles.slice(0, 3).map((v) => ({ valor: v.ref, texto: v.resumen })) };
  }
  if (!inmuebleRef && e.inmuebles.refs.length) inmuebleRef = e.inmuebles.refs[0]!;
  if (!inmuebleRef && e.inmuebles.ordinal !== null && ctx.visibles.length) inmuebleRef = ctx.visibles.at(e.inmuebles.ordinal > 0 ? e.inmuebles.ordinal - 1 : -1)?.ref ?? null;
  if (!inmuebleRef && ctx.viendo && accion === "detalle_inmueble") inmuebleRef = ctx.viendo.ref;
  const cp = asChoice(answers.campo_pregunta);
  const campoPregunta = cp && gateChoice(cp, t.campo_pregunta).outcome !== "preguntar" ? cp.choice : null;
  const fb = asChoice(answers.feedback_motivo);
  const feedbackMotivo = intencion === "feedback_resultado" && fb && gateChoice(fb, t.feedback_motivo).outcome !== "preguntar" ? fb.choice : null;

  return { intencion, accion, aclarar, cambios, seguimiento, inmuebleRef, campoPregunta, feedbackMotivo, inyeccion, avisos, decisiones, degradado: false };
}

// Interpretación degradada (sin Jev) -----------------------------------------------------

const PALABRAS_INTENCION: Array<[RegExp, Intencion]> = [
  [/\b(ignora|olvida (tus|las) (instrucciones|reglas)|system prompt|comision|datos del propietario|ignore (previous|your))\w*\b/, "fuera_de_ambito"],
  [/\b(visit|visita|visitar|ver (el|la) (piso|casa)|verlo|viewing)\w*\b/, "pedir_visita"],
  [/\b(contact|llamad|llamen|agente|hablar con)\w*\b/, "contactar_agente"],
  [/\b(alert|alerta|avisame|avisadme|notif)\w*\b/, "crear_alerta"],
  [/\b(hipoteca|cuota|financiaci|mortgage|monthly payment)\w*\b|\bpagaria al mes\b/, "calcular_hipoteca"],
  [/\b(precio medio|precio por metro|m2 en|metro cuadrado en|como es (la zona|el barrio|el pueblo)|que tal es|cuanto cuesta vivir|average price|what is .* like)\b/, "info_zona"],
  [/\b(compar)\w*\b/, "comparar"],
  [/\b(valor|tasar|cuanto vale mi|vender mi|value my)\w*\b/, "valorar_mi_vivienda"],
  [/\b(no me (gusta|encaja|convence)|muy (oscuro|caro|pequeno)|demasiado|me gusta)\w*\b/, "feedback_resultado"],
  [/\b(tiene|cuanto|cual es|hay|does it|how much)\w*\b.*\?|\?$/, "detalle_inmueble"],
  [/\b(busco|buscamos|quiero|queremos|necesito|piso|casa|chalet|atico|alquil|compr|zona|en venta|looking|want)\w*\b/, "buscar"],
  [/\b(hola|gracias|buenas|buenos dias|hello|hi|hey|thanks|thank you)\b/, "conversar"],
];

export function interpretarSinJev(e: Extraccion, ctx: ContextoMensaje, mensaje: string): Interpretacion {
  const p = mensaje.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let intencion: Intencion = PALABRAS_INTENCION.find(([re]) => re.test(p))?.[1] ?? (e.zonas.length || e.cifras.length || e.requisitos.length ? "buscar" : "conversar");
  if (intencion === "detalle_inmueble" && !ctx.viendo && !e.inmuebles.refs.length && e.inmuebles.ordinal === null && (e.zonas.length || e.cifras.length)) intencion = "buscar";
  if (intencion === "buscar" && ctx.ficha && !e.zonas.length && !e.cifras.length) intencion = "refinar";
  const accion = ACCION_DE_INTENCION[intencion] ?? null;
  const cambios: Partial<FichaBusqueda> = {};
  if (e.operacion) cambios.operacion = e.operacion;
  // Sin Jev solo se aceptan zonas escritas tal cual o con errata clara (score alto).
  const zonas = e.zonas.map((z) => z.candidatas[0]).filter((c) => c && c.score >= 0.9).map((c) => c!.zona.path);
  if (zonas.length) cambios.zonas = zonas;
  if (e.tipos.length === 1) cambios.tipos = e.tipos;
  const precio = e.cifras.find((c) => c.pista !== "cuota");
  if (precio) {
    if (precio.pista === "minimo") cambios.precioMin = precio.valor.toNumber();
    else cambios.precioMax = precio.valor.toNumber();
  }
  if (e.habitaciones !== null) cambios.habMin = e.habitaciones;
  const req: Record<string, "imprescindible" | "deseable" | "rechazo"> = {};
  for (const r of e.requisitos) req[r.campo] = r.negado ? "rechazo" : "deseable";
  if (e.sinBajos) req.planta_baja = "rechazo";
  if (Object.keys(req).length) cambios.requisitos = req;
  let inmuebleRef = e.inmuebles.refs[0] ?? null;
  if (!inmuebleRef && e.inmuebles.ordinal !== null) inmuebleRef = ctx.visibles.at(e.inmuebles.ordinal > 0 ? e.inmuebles.ordinal - 1 : -1)?.ref ?? null;
  if (!inmuebleRef && ctx.viendo) inmuebleRef = ctx.viendo.ref;
  const campo = CATALOG.fields.find((f) => f.public && new RegExp(`\\b${f.label.es.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(" ")[0]}`).test(p));
  return {
    intencion,
    accion,
    aclarar: null,
    cambios,
    seguimiento: Boolean(ctx.ficha) && !e.zonas.length,
    inmuebleRef,
    campoPregunta: campo?.id ?? null,
    feedbackMotivo: /oscur/.test(p) ? "luz" : /car[oa]/.test(p) ? "precio" : /pequen/.test(p) ? "tamano" : null,
    inyeccion: intencion === "fuera_de_ambito" && /ignora|instrucciones|system|comision|propietario|ignore/.test(p),
    avisos: ["degradado"],
    decisiones: [],
    degradado: true,
  };
}
