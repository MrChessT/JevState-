// Filtros de búsqueda ⇄ URL canónica. La zona y la operación van en la ruta (SEO):
// /venta/murcia/el-carmen?precio_max=250000&hab_min=3&tipo=piso&con=terraza,ascensor&orden=precio_asc&pagina=2
import { z } from "zod";
import { ruta, type Locale } from "@/i18n/config";

export const ORDENES = ["recientes", "precio_asc", "precio_desc", "m2_precio_asc", "superficie_desc"] as const;
export const TIPOS_BUSQUEDA = ["piso", "atico", "duplex", "casa", "chalet", "adosado", "estudio", "local", "terreno"] as const;
/** Características filtrables (booleanos o enum con valor positivo). */
export const CARACTERISTICAS_FILTRO = ["terraza", "ascensor", "garaje", "piscina", "trastero", "aire_acondicionado", "exterior", "amueblado"] as const;

export const POR_PAGINA = 12;

const entero = z.coerce.number().int().positive().optional();

export const Filtros = z.object({
  operacion: z.enum(["venta", "alquiler"]),
  zona: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)?$/).optional(),
  precioMin: entero,
  precioMax: entero,
  habMin: z.coerce.number().int().min(0).max(10).optional(),
  banosMin: z.coerce.number().int().min(1).max(10).optional(),
  m2Min: entero,
  tipos: z.array(z.enum(TIPOS_BUSQUEDA)).default([]),
  con: z.array(z.enum(CARACTERISTICAS_FILTRO)).default([]),
  orden: z.enum(ORDENES).default("recientes"),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});
export type Filtros = z.infer<typeof Filtros>;

type Params = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const lista = (v: string | string[] | undefined) => (uno(v) ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Lee filtros de la ruta y la query; lo que no es válido se ignora (nunca un error 500 por una URL). */
export function leerFiltros(operacion: "venta" | "alquiler", zona: string[] | undefined, q: Params): Filtros {
  const bruto = {
    operacion,
    zona: zona?.length ? zona.join("/") : undefined,
    precioMin: uno(q.precio_min),
    precioMax: uno(q.precio_max),
    habMin: uno(q.hab_min),
    banosMin: uno(q.banos_min),
    m2Min: uno(q.m2_min),
    tipos: lista(q.tipo).filter((t) => (TIPOS_BUSQUEDA as readonly string[]).includes(t)),
    con: lista(q.con).filter((t) => (CARACTERISTICAS_FILTRO as readonly string[]).includes(t)),
    orden: (ORDENES as readonly string[]).includes(uno(q.orden) ?? "") ? uno(q.orden) : undefined,
    pagina: uno(q.pagina),
  };
  const r = Filtros.safeParse(bruto);
  if (r.success) return r.data;
  // Quita los campos inválidos uno a uno.
  const limpio: Record<string, unknown> = { ...bruto };
  for (const issue of r.error.issues) delete limpio[String(issue.path[0])];
  return Filtros.parse(limpio);
}

/** URL canónica de unos filtros (orden estable de parámetros; los valores por defecto no se escriben). */
export function urlFiltros(locale: Locale, f: Filtros, cambios: Partial<Filtros> = {}): string {
  const x = { ...f, ...cambios };
  const base = ruta(locale, x.operacion, ...(x.zona ? x.zona.split("/") : []));
  const p = new URLSearchParams();
  if (x.precioMin) p.set("precio_min", String(x.precioMin));
  if (x.precioMax) p.set("precio_max", String(x.precioMax));
  if (x.habMin) p.set("hab_min", String(x.habMin));
  if (x.banosMin) p.set("banos_min", String(x.banosMin));
  if (x.m2Min) p.set("m2_min", String(x.m2Min));
  if (x.tipos.length) p.set("tipo", [...x.tipos].sort().join(","));
  if (x.con.length) p.set("con", [...x.con].sort().join(","));
  if (x.orden !== "recientes") p.set("orden", x.orden);
  if (x.pagina > 1) p.set("pagina", String(x.pagina));
  const qs = p.toString().replace(/%2C/g, ",");
  return qs ? `${base}?${qs}` : base;
}

/** ¿Hay filtros además de operación y zona? (las páginas con filtros no se indexan). */
export function tieneFiltros(f: Filtros): boolean {
  return Boolean(f.precioMin || f.precioMax || f.habMin || f.banosMin || f.m2Min || f.tipos.length || f.con.length || f.orden !== "recientes" || f.pagina > 1);
}

/** URL de la ficha: /venta/murcia/el-carmen/piso-3-hab-ref-fic-0001 */
export function urlFicha(locale: Locale, i: { operacion: string; zonaPath: string; slug: string }): string {
  const op = i.operacion === "venta" ? "venta" : "alquiler";
  return ruta(locale, op, ...i.zonaPath.split("/"), i.slug);
}

export const esSlugFicha = (s: string | undefined) => Boolean(s && /-ref-[a-z0-9-]+$/.test(s));
