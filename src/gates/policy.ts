// Política de confianza por contexto (sección 4.3). Cada acción declara qué datos necesita
// (requeridos, opcionales, irrelevantes), su riesgo y qué hacer ante la duda. Lo irrelevante no se
// pregunta a Jev, no se muestra y no genera aclaraciones.
import { HIGH_RISK_ACT, LITERAL_RELAX, type GateKey, type GateSpec, type Thresholds } from "./thresholds";

export type Riesgo = "lectura" | "escritura_baja" | "medio" | "alto";

export type Accion = "buscar" | "detalle_inmueble" | "comparar" | "crear_alerta" | "pedir_visita" | "contactar_agente" | "valorar_mi_vivienda";

export type Dato =
  | "zona" | "presupuesto" | "inmueble_ref" | "inmuebles" | "tipo" | "habitaciones" | "requisitos" | "proximidad"
  | "campo" | "aspectos" | "criterios" | "email" | "frecuencia" | "franja" | "nombre" | "telefono_o_email"
  | "consentimiento" | "mensaje" | "direccion_o_zona" | "superficie" | "estado" | "planta" | "extras" | "perfil"
  | "contacto" | "operacion" | "prioridad";

/** Qué hace el asistente cuando falta un dato o no está seguro (columna «Comportamiento ante la duda»). */
export type AnteLaDuda =
  | "ampliar_y_avisar" // busca en las 2 zonas más probables y lo dice
  | "preguntar_con_tarjetas" // «¿te refieres a este o a…?»
  | "tabla_generada" // la comparación la hace el código
  | "borrador_opt_in" // borrador con 1 clic y doble opt-in
  | "borrador_confirmacion_explicita" // nunca se envía por inferencia
  | "preguntar_un_dato"; // un dato por turno, con chips

export interface PoliticaAccion {
  /** Cada elemento es un requisito; un array interno significa «cualquiera de estos». */
  requeridos: Array<Dato | Dato[]>;
  opcionales: Dato[];
  irrelevantes: Dato[];
  riesgo: Riesgo;
  anteLaDuda: AnteLaDuda;
  /** Clave de umbral de la intención para esta acción. */
  umbralIntencion: Extract<GateKey, "intencion_lectura" | "intencion_escritura">;
}

export const POLITICAS: Record<Accion, PoliticaAccion> = {
  buscar: {
    requeridos: [["zona", "presupuesto", "inmueble_ref"]],
    opcionales: ["operacion", "tipo", "habitaciones", "requisitos", "proximidad", "prioridad", "perfil"],
    irrelevantes: ["contacto", "email", "telefono_o_email", "nombre", "consentimiento", "franja"],
    riesgo: "lectura",
    anteLaDuda: "ampliar_y_avisar",
    umbralIntencion: "intencion_lectura",
  },
  detalle_inmueble: {
    requeridos: ["inmueble_ref"],
    opcionales: ["campo"],
    irrelevantes: ["presupuesto", "perfil", "contacto", "email", "telefono_o_email", "nombre", "consentimiento"],
    riesgo: "lectura",
    anteLaDuda: "preguntar_con_tarjetas",
    umbralIntencion: "intencion_lectura",
  },
  comparar: {
    requeridos: ["inmuebles"],
    opcionales: ["aspectos"],
    irrelevantes: ["perfil", "contacto", "email", "telefono_o_email", "nombre", "consentimiento"],
    riesgo: "lectura",
    anteLaDuda: "tabla_generada",
    umbralIntencion: "intencion_lectura",
  },
  crear_alerta: {
    requeridos: ["criterios", "email"],
    opcionales: ["frecuencia"],
    irrelevantes: ["perfil", "telefono_o_email", "franja"],
    riesgo: "escritura_baja",
    anteLaDuda: "borrador_opt_in",
    umbralIntencion: "intencion_escritura",
  },
  pedir_visita: {
    requeridos: ["inmueble_ref", "franja", "nombre", "telefono_o_email", "consentimiento"],
    opcionales: ["mensaje"],
    irrelevantes: ["perfil", "presupuesto"],
    riesgo: "alto",
    anteLaDuda: "borrador_confirmacion_explicita",
    umbralIntencion: "intencion_escritura",
  },
  contactar_agente: {
    requeridos: ["inmueble_ref", "nombre", "telefono_o_email", "consentimiento"],
    opcionales: ["mensaje", "franja"],
    irrelevantes: ["perfil", "presupuesto"],
    riesgo: "alto",
    anteLaDuda: "borrador_confirmacion_explicita",
    umbralIntencion: "intencion_escritura",
  },
  valorar_mi_vivienda: {
    requeridos: ["direccion_o_zona", "superficie", "tipo"],
    opcionales: ["estado", "planta", "extras"],
    irrelevantes: ["presupuesto", "perfil"],
    riesgo: "medio",
    anteLaDuda: "preguntar_un_dato",
    umbralIntencion: "intencion_lectura",
  },
};

export function esIrrelevante(accion: Accion, dato: Dato): boolean {
  return POLITICAS[accion].irrelevantes.includes(dato);
}

/** ¿Hay que evaluar (preguntar a Jev, mostrar, aclarar) este dato para esta acción? */
export function esRelevante(accion: Accion, dato: Dato): boolean {
  const p = POLITICAS[accion];
  return p.requeridos.some((r) => (Array.isArray(r) ? r.includes(dato) : r === dato)) || p.opcionales.includes(dato);
}

/** Requisitos que faltan. Un grupo «cualquiera de» se devuelve entero para poder ofrecer chips de cada opción. */
export function faltan(accion: Accion, presentes: ReadonlySet<Dato>): Array<Dato | Dato[]> {
  return POLITICAS[accion].requeridos.filter((r) => (Array.isArray(r) ? !r.some((d) => presentes.has(d)) : !presentes.has(r)));
}

/**
 * Umbral efectivo de un dato en una acción:
 *  - riesgo alto: el umbral de actuar nunca baja de 0,95 (y no hay relajación por literal);
 *  - evidencia literal (el dato aparece tal cual en el mensaje): act y ask bajan 0,15 y el margen
 *    mínimo se reduce a la mitad. Nunca en acciones de riesgo alto.
 */
export function umbral(t: Thresholds, key: GateKey, accion: Accion | null, opciones: { literal?: boolean } = {}): GateSpec {
  const riesgo = accion ? POLITICAS[accion].riesgo : "lectura";
  let spec: GateSpec = { ...t[key] };
  if (riesgo === "alto" && spec.direction !== "si_malo") spec = { ...spec, act: Math.max(spec.act, HIGH_RISK_ACT) };
  if (opciones.literal && riesgo !== "alto" && spec.direction !== "si_malo") {
    spec = {
      ...spec,
      act: round2(Math.max(0, spec.act - LITERAL_RELAX)),
      ask: round2(Math.max(0, spec.ask - LITERAL_RELAX)),
      ...(spec.minMargin !== undefined ? { minMargin: spec.minMargin / 2 } : {}),
    };
  }
  return spec;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Intenciones de la llamada 1 → acción de la política (null: no hay acción, p. ej. conversar). */
export const ACCION_DE_INTENCION: Record<string, Accion | null> = {
  buscar: "buscar",
  refinar: "buscar",
  feedback_resultado: "buscar",
  detalle_inmueble: "detalle_inmueble",
  comparar: "comparar",
  valorar_mi_vivienda: "valorar_mi_vivienda",
  pedir_visita: "pedir_visita",
  contactar_agente: "contactar_agente",
  crear_alerta: "crear_alerta",
  conversar: null,
  fuera_de_ambito: null,
};
