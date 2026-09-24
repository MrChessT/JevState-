import { createHash } from "node:crypto";

export interface Punto {
  lat: number;
  lon: number;
}

const R = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en metros (haversine). Suficiente para distancias urbanas y comarcales. */
export function distanciaMetros(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Ubicación pública aproximada: desplaza el punto entre 120 y 250 m en una dirección fija por
 * inmueble (determinista), para no revelar la dirección exacta en el mapa del portal.
 */
export function ubicacionAproximada(p: Punto, semilla: string): Punto {
  const h = createHash("sha256").update(semilla).digest();
  const angulo = (h.readUInt16BE(0) / 65535) * 2 * Math.PI;
  const metros = 120 + (h.readUInt16BE(2) / 65535) * 130;
  const dLat = (metros * Math.cos(angulo)) / 111_320;
  const dLon = (metros * Math.sin(angulo)) / (111_320 * Math.cos(rad(p.lat)));
  return { lat: Number((p.lat + dLat).toFixed(6)), lon: Number((p.lon + dLon).toFixed(6)) };
}

/** Minutos andando a 80 m/min, redondeados hacia arriba. */
export const minutosAndando = (metros: number) => Math.max(1, Math.ceil(metros / 80));
