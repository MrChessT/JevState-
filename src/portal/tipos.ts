import type { CampoCanonico } from "@/sde/cascada/canonico";

export type Operacion = "venta" | "alquiler";

export interface InmuebleResumen {
  id: string;
  ref: string;
  slug: string;
  operacion: Operacion | "alquiler_vacacional";
  tipo: string | null;
  titulo: string;
  zonaPath: string;
  zonaNombre: string;
  municipioNombre: string;
  precio: number | null;
  precioAnterior: number | null;
  superficie: number | null;
  habitaciones: number | null;
  banos: number | null;
  /** Posición de la planta (bajo, intermedia, ático…) si consta. */
  plantaTipo?: string | null;
  lat: number | null;
  lon: number | null;
  foto: string | null;
  /** Rasgos destacados confirmados o probables (para el «por qué» de la tarjeta). */
  rasgos: Array<{ campo: string; status: CampoCanonico["status"] }>;
  publicadoEn: string;
  ficticio: boolean;
}

export interface InmuebleFicha extends InmuebleResumen {
  descripcion: string;
  descripcionTraducida: boolean;
  campos: Record<string, CampoCanonico>;
  fotos: string[];
  distancias: Array<{ categoria: string; nombre: string | null; metros: number; minutos: number }>;
  agente: { nombre: string; telefono: string | null; email: string | null } | null;
}

export interface EstadisticaZona {
  path: string;
  n: number;
  /** Mediana de €/m² (venta) o €/m²/mes (alquiler), como texto decimal. */
  medianaM2: string | null;
  p25M2: string | null;
  p75M2: string | null;
}
