// Batería sin Jev de zonas con erratas y alias: variantes sistemáticas sobre todos los nombres.
import { clave } from "../../src/extraccion/texto";
import { ZONAS } from "../../src/zonas/buscar";
import { BARRIOS, MUNICIPIOS } from "../../src/zonas/datos";

export interface CasoZona {
  consulta: string;
  /** Rutas aceptables (varias si el nombre es compartido, como «La Manga»). */
  esperado: string[];
  variante: string;
}

const PARECIDAS: Array<[RegExp, string]> = [[/g(?=[ei])/, "j"], [/v/, "b"], [/ll/, "y"], [/z/, "s"], [/c(?=[ei])/, "s"]];

function variantes(nombre: string): Array<[string, string]> {
  const k = clave(nombre);
  const out: Array<[string, string]> = [[nombre, "literal"], [k, "sin_tildes"], [nombre.toUpperCase(), "mayusculas"]];
  if (k.replace(/\s/g, "").length >= 6) {
    const medio = Math.floor(k.length / 2);
    if (k[medio] !== " ") out.push([k.slice(0, medio) + k.slice(medio + 1), "falta_letra"]);
    if (k[medio] !== " " && k[medio + 1] && k[medio + 1] !== " ") out.push([k.slice(0, medio) + k[medio + 1] + k[medio] + k.slice(medio + 2), "transposicion"]);
    for (const [re, rep] of PARECIDAS) if (re.test(k)) {
      out.push([k.replace(re, rep), "letra_parecida"]);
      break;
    }
  }
  return out;
}

export function casosZonas(): CasoZona[] {
  const porClave = new Map<string, string[]>();
  for (const z of ZONAS) for (const c of z.claves) porClave.set(c, [...(porClave.get(c) ?? []), z.path]);
  const nombres: Array<[string, string]> = [
    ...MUNICIPIOS.flatMap((m) => [[m.nombre, m.slug] as [string, string], ...m.alias.map((a) => [a, m.slug] as [string, string])]),
    ...BARRIOS.filter((b) => clave(b.nombre) !== "centro" && !/ centro$/.test(clave(b.nombre))).map((b) => [b.nombre.replace(/ \((Cartagena|San Javier)\)$/, ""), `${b.municipio}/${b.slug}`] as [string, string]),
  ];
  const casos: CasoZona[] = [];
  const vistos = new Set<string>();
  for (const [nombre, path] of nombres) {
    const esperado = porClave.get(clave(nombre)) ?? [path];
    for (const [consulta, variante] of variantes(nombre)) {
      const k = `${clave(consulta)}|${esperado.join(",")}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      casos.push({ consulta, esperado: esperado.includes(path) ? esperado : [path, ...esperado], variante });
    }
  }
  return casos;
}
