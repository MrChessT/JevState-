// Umbrales ÚNICOS de las puertas del asistente (sección 4.3). Los umbrales de los campos del
// pipeline de datos viven en el catálogo (columnas gate_act / gate_ask de Fields).
//
// Sobrescribibles por entorno: GATE_<CLAVE>_ACT, GATE_<CLAVE>_ASK y GATE_<CLAVE>_MARGIN
// (clave en mayúsculas, p. ej. GATE_ZONA_ACT=0.75). Ningún umbral se cambia sin pasar el set de
// evaluación (`npm run eval:sweep`), y el cambio se anota en docs/CATALOGO_JEV.md.

export type GateDirection =
  /** choice o score: se actúa si la confianza ≥ act. */
  | "confianza"
  /** noul donde «sí» es lo deseado (el importe es el presupuesto): se actúa si p ≥ act. */
  | "si_bueno"
  /** noul donde «sí» es una alarma (inyección, ambigüedad): se actúa si p ≤ act; si p > ask se para. */
  | "si_malo";

export interface GateSpec {
  act: number;
  ask: number;
  /** Solo choice: diferencia mínima entre las dos opciones más probables para actuar. */
  minMargin?: number;
  direction: GateDirection;
}

const DEFAULTS = {
  // Intención (choice). Lectura: buscar, refinar, detalle, comparar, valorar, conversar.
  intencion_lectura: { act: 0.6, ask: 0.45, direction: "confianza" },
  // Escritura: crear alerta, pedir visita, contactar. Aun así, nunca se envía nada sin confirmación.
  intencion_escritura: { act: 0.85, ask: 0.5, direction: "confianza" },
  operacion: { act: 0.7, ask: 0.45, direction: "confianza" },
  zona: { act: 0.7, ask: 0.45, minMargin: 0.2, direction: "confianza" },
  tipo: { act: 0.7, ask: 0.45, direction: "confianza" },
  presupuesto_ok: { act: 0.85, ask: 0.6, direction: "si_bueno" },
  presupuesto_tipo: { act: 0.7, ask: 0.45, direction: "confianza" },
  requisito: { act: 0.7, ask: 0.45, direction: "confianza" },
  proximidad: { act: 0.6, ask: 0.4, direction: "confianza" },
  prioridad: { act: 0.6, ask: 0.4, direction: "confianza" },
  // Solo se usa si el usuario lo declara; con dudas, se ignora (no se pregunta por el perfil).
  perfil_declarado: { act: 0.8, ask: 0.8, direction: "confianza" },
  inmueble_ref: { act: 0.75, ask: 0.45, minMargin: 0.25, direction: "confianza" },
  campo_pregunta: { act: 0.7, ask: 0.45, minMargin: 0.2, direction: "confianza" },
  feedback_motivo: { act: 0.6, ask: 0.4, direction: "confianza" },
  // Noul «¿continúa la búsqueda anterior?»: ≥ act → se hereda lo que el mensaje no dice.
  seguimiento: { act: 0.65, ask: 0.65, direction: "si_bueno" },
  // Confirmar un borrador por chat exige mucha seguridad; entre ask y act se pregunta «¿lo envío?».
  borrador: { act: 0.9, ask: 0.6, direction: "confianza" },
  ambiguo: { act: 0.3, ask: 0.6, direction: "si_malo" },
  inyeccion: { act: 0.7, ask: 0.7, direction: "si_malo" },
  // Llamada 2: encaje (score) y deseables sin campo estructurado fiable (noul).
  encaje: { act: 0.5, ask: 0.3, direction: "confianza" },
  deseable: { act: 0.8, ask: 0.5, direction: "si_bueno" },
  // Valoración: ¿es realmente comparable? y ajuste por estado.
  comparable: { act: 0.7, ask: 0.5, direction: "si_bueno" },
  ajuste_estado: { act: 0.6, ask: 0.4, direction: "confianza" },
} as const satisfies Record<string, GateSpec>;

export type GateKey = keyof typeof DEFAULTS;
export type Thresholds = Record<GateKey, GateSpec>;
export const GATE_KEYS = Object.keys(DEFAULTS) as GateKey[];

/** Acciones de riesgo alto (pedir visita, contactar): el umbral de actuar nunca baja de aquí. */
export const HIGH_RISK_ACT = 0.95;
/** Evidencia literal: cuánto baja el umbral si el dato aparece tal cual en el mensaje. */
export const LITERAL_RELAX = 0.15;

function readUnit(env: Record<string, string | undefined>, name: string, fallback: number | undefined): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} debe ser un número entre 0 y 1 (recibido «${raw}»)`);
  return value;
}

export function loadThresholds(env: Record<string, string | undefined> = process.env): Thresholds {
  const result = {} as Thresholds;
  for (const key of GATE_KEYS) {
    const spec: GateSpec = DEFAULTS[key];
    const prefix = `GATE_${key.toUpperCase()}`;
    const merged: GateSpec = {
      act: readUnit(env, `${prefix}_ACT`, spec.act)!,
      ask: readUnit(env, `${prefix}_ASK`, spec.ask)!,
      direction: spec.direction,
    };
    const margin = readUnit(env, `${prefix}_MARGIN`, spec.minMargin);
    if (margin !== undefined) merged.minMargin = margin;
    // Coherencia: en «confianza» y «si_bueno» ask ≤ act; en «si_malo» act ≤ ask.
    const ok = merged.direction === "si_malo" ? merged.act <= merged.ask : merged.ask <= merged.act;
    if (!ok) throw new Error(`${prefix}: umbrales incoherentes (act ${merged.act}, ask ${merged.ask}, ${merged.direction})`);
    result[key] = merged;
  }
  return result;
}

export const DEFAULT_THRESHOLDS: Thresholds = loadThresholds({});
