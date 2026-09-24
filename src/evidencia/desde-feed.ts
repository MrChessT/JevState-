// Evidencias de los campos estructurados del feed o del CSV (fuente fuerte).
import Decimal from "decimal.js";
import { plano } from "@/extraccion/texto";
import { extraerPlanta } from "@/extraccion/planta";
import { extraerCertificado } from "@/extraccion/varios";
import { parseCifra } from "@/extraccion/numeros";
import type { RegistroFuente } from "@/ingesta/tipos";
import { CARACTERISTICA_FEED, OPERACION_FEED, siNoTexto, TIPO_FEED } from "./mapeos";
import { evidencia, type Evidencia } from "./tipos";

function numero(v: string): Decimal | null {
  const c = parseCifra(v.replace(/[€\s]|eur|m2|m²/gi, ""));
  return c && !c.alternativa ? c.valor : null;
}

export function evidenciasDeFeed(r: RegistroFuente): Evidencia[] {
  const source = r.fuente === "csv" ? "csv" : r.fuente === "manual" ? "manual" : "feed";
  const out: Evidencia[] = [];
  const add = (path: string, campo: string, parsed: Record<string, unknown>) =>
    out.push(evidencia({ listingKey: r.ref, source, path, raw: r.campos[path]!, campo, parsed, capturedAt: r.capturadoEn }));
  const c = r.campos;
  const k = (...claves: string[]) => claves.find((x) => c[x] !== undefined && c[x] !== "");

  // Operación: Kyero price_freq, o columna «operacion» del CSV.
  const op = k("price_freq", "operacion");
  if (op && OPERACION_FEED[plano(c[op]!)]) add(op, "operacion", { valor: OPERACION_FEED[plano(c[op]!)] });

  const tipo = k("type", "tipo");
  if (tipo && TIPO_FEED[plano(c[tipo]!)]) add(tipo, "tipo", { valor: TIPO_FEED[plano(c[tipo]!)] });

  const precio = k("price", "precio");
  if (precio) {
    const v = numero(c[precio]!);
    const periodo = op && OPERACION_FEED[plano(c[op]!)] === "alquiler" ? "mes" : op && OPERACION_FEED[plano(c[op]!)] === "alquiler_vacacional" ? "semana" : "unico";
    if (v && v.gt(0)) add(precio, "precio", { valor: v.toString(), unidad: (c.currency ?? "EUR").toUpperCase(), periodo, contexto: "precio" });
  }

  const numericos: Array<[string[], string, string]> = [
    [["surface_area/built", "superficie_construida", "built"], "superficie_construida", "m2"],
    [["surface_area/usable", "superficie_util"], "superficie_util", "m2"],
    [["surface_area/plot", "superficie_parcela", "plot"], "superficie_parcela", "m2"],
    [["beds", "habitaciones", "bedrooms"], "habitaciones", ""],
    [["baths", "banos", "bathrooms"], "banos", ""],
    [["community_fees", "gastos_comunidad"], "gastos_comunidad", "EUR/mes"],
    [["ibi"], "ibi", "EUR/año"],
    [["previous_price", "precio_anterior"], "precio_anterior", "EUR"],
  ];
  for (const [claves, campo, unidad] of numericos) {
    const key = k(...claves);
    if (!key) continue;
    const v = numero(c[key]!);
    // Kyero usa 0 para «no aplica» (parcela de un piso, construida de un terreno): no es un dato.
    if (!v || (v.isZero() && campo.startsWith("superficie"))) continue;
    if ((campo === "habitaciones" || campo === "banos") && !v.isInteger()) continue;
    add(key, campo, { valor: v.toString(), unidad });
  }

  const planta = k("floor", "planta");
  if (planta) {
    const n = Number(c[planta]);
    if (Number.isInteger(n)) add(planta, "planta", { valor: String(n), unidad: "" });
    else {
      const p = extraerPlanta(c[planta]!)[0];
      if (p) {
        if (p.numero !== null) add(planta, "planta", { valor: String(p.numero), unidad: "" });
        add(planta, "planta_tipo", { valor: p.tipo });
      }
    }
  }

  const energia = k("energy_rating/consumption", "certificado_energetico");
  if (energia) {
    const v = plano(c[energia]!).trim();
    if (/^[a-g]$/.test(v)) add(energia, "certificado_energetico", { valor: v });
    else {
      const x = extraerCertificado(`certificado energético ${c[energia]}`)[0];
      if (x) add(energia, "certificado_energetico", { valor: x.valor });
    }
  }

  const piscina = k("pool", "piscina");
  if (piscina) {
    const b = siNoTexto(c[piscina]!);
    // «pool = 1» no dice si es privada o comunitaria: solo acota.
    if (b === false) add(piscina, "piscina", { valor: "no_tiene" });
    else if (b === true) add(piscina, "piscina", { valores: ["privada", "comunitaria"] });
  }

  const catastro = k("cadastral_reference", "referencia_catastral");
  if (catastro) add(catastro, "referencia_catastral", { valor: c[catastro]!.replace(/\s/g, "").toUpperCase() });

  const direccion = k("address", "direccion");
  if (direccion) add(direccion, "direccion", { valor: c[direccion] });

  // Características del feed (lista).
  for (const [path, valor] of Object.entries(c)) {
    if (!/^features\/feature\[\d+\]$/.test(path)) continue;
    const f = plano(valor).trim();
    for (const [re, campo, v] of CARACTERISTICA_FEED) if (re.test(f)) add(path, campo, { valor: v });
  }

  // Booleanos en columnas del CSV («terraza: si»).
  for (const campo of ["terraza", "balcon", "ascensor", "trastero", "aire_acondicionado", "calefaccion", "amueblado", "accesible", "negociable", "vpo", "okupado", "nuda_propiedad", "subasta", "alquilado_con_inquilino", "licencia_turistica"]) {
    if (c[campo] === undefined) continue;
    const b = siNoTexto(c[campo]!);
    if (b !== null) add(campo, campo, { valor: b });
  }
  const garaje = k("garaje", "parking");
  if (garaje) {
    const t = plano(c[garaje]!);
    if (/incluid/.test(t)) add(garaje, "garaje", { valor: "incluido" });
    else if (/opcional|aparte|extra/.test(t)) add(garaje, "garaje", { valor: "opcional" });
    else if (siNoTexto(c[garaje]!) === false) add(garaje, "garaje", { valor: "no_tiene" });
    else if (siNoTexto(c[garaje]!) === true) add(garaje, "garaje", { valores: ["incluido", "opcional"] });
  }
  return out;
}
