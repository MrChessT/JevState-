// Rasgos de la tarjeta y de los filtros «con…»: qué valor de cada campo cuenta como tenerlo.
// Misma definición que public.inmueble_resumen() (migración 0010); un test lo comprueba.
export const RASGOS_POSITIVOS: Record<string, true | readonly string[]> = {
  terraza: true,
  balcon: true,
  ascensor: true,
  garaje: ["incluido", "opcional"],
  piscina: ["privada", "comunitaria"],
  trastero: true,
  aire_acondicionado: true,
  calefaccion: true,
  exterior: ["exterior"],
  amueblado: true,
  accesible: true,
  vistas: ["mar", "montana", "ciudad", "jardin"],
  luminosidad: ["luminoso", "muy_luminoso"],
  ruido: ["tranquilo", "muy_tranquilo"],
  estado: ["reformado", "a_estrenar"],
};

export const RASGOS = Object.keys(RASGOS_POSITIVOS);

export function esPositivo(campo: string, valor: unknown): boolean {
  const def = RASGOS_POSITIVOS[campo];
  if (!def) return false;
  if (def === true) return valor === true;
  return typeof valor === "string" && def.includes(valor);
}

/** Condición SQL equivalente (para la migración y su test). */
export function condicionSql(): string {
  return Object.entries(RASGOS_POSITIVOS)
    .map(([c, def]) => (def === true ? `(f.field_id = '${c}' and f.value = 'true'::jsonb)` : `(f.field_id = '${c}' and f.value #>> '{}' in (${def.map((v) => `'${v}'`).join(", ")}))`))
    .join("\n                            or ");
}
