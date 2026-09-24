"use client";

import { useEffect, useRef, useState } from "react";
import s from "./portal.module.css";

// Mapa de resultados con MapLibre (carga diferida: solo cuando el mapa entra en pantalla).
// Estilo de teselas configurable (NEXT_PUBLIC_MAP_STYLE); por defecto OpenFreeMap, sin clave.
const ESTILO = process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/positron";

export interface PuntoMapa {
  ref: string;
  lat: number;
  lon: number;
  precio: number | null;
}

export function MapaResultados({ puntos, etiqueta, formatoPrecio }: { puntos: PuntoMapa[]; etiqueta: string; formatoPrecio: "venta" | "alquiler" }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !contenedor.current || puntos.length === 0) return;
    let mapa: import("maplibre-gl").Map | null = null;
    let cancelado = false;
    const marcarTarjeta = (ref: string | null) => {
      document.querySelectorAll("[data-ref].resaltada").forEach((n) => n.classList.remove("resaltada"));
      if (ref) document.querySelector(`[data-ref="${CSS.escape(ref)}"]`)?.classList.add("resaltada");
    };
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelado || !contenedor.current) return;
      const lons = puntos.map((p) => p.lon);
      const lats = puntos.map((p) => p.lat);
      mapa = new maplibre.Map({
        container: contenedor.current,
        style: ESTILO,
        bounds: [
          [Math.min(...lons) - 0.02, Math.min(...lats) - 0.02],
          [Math.max(...lons) + 0.02, Math.max(...lats) + 0.02],
        ],
        attributionControl: { compact: true },
        cooperativeGestures: true,
      });
      mapa.addControl(new maplibre.NavigationControl({ showCompass: false }));
      mapa.on("load", () => {
        if (!mapa) return;
        mapa.addSource("inmuebles", {
          type: "geojson",
          data: { type: "FeatureCollection", features: puntos.map((p) => ({ type: "Feature", properties: { ref: p.ref, precio: p.precio === null ? "" : formatoPrecio === "venta" ? `${Math.round(p.precio / 1000)}k` : `${p.precio}` }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) },
        });
        mapa.addLayer({ id: "puntos", type: "circle", source: "inmuebles", paint: { "circle-radius": 7, "circle-color": getComputedStyle(document.documentElement).getPropertyValue("--marca").trim() || "#1f4e5f", "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
        mapa.on("mouseenter", "puntos", (e) => {
          mapa!.getCanvas().style.cursor = "pointer";
          marcarTarjeta(String(e.features?.[0]?.properties?.ref ?? ""));
        });
        mapa.on("mouseleave", "puntos", () => {
          mapa!.getCanvas().style.cursor = "";
          marcarTarjeta(null);
        });
        mapa.on("click", "puntos", (e) => {
          const ref = String(e.features?.[0]?.properties?.ref ?? "");
          const tarjeta = document.getElementById(`inmueble-${ref}`);
          tarjeta?.scrollIntoView({ behavior: "smooth", block: "center" });
          tarjeta?.querySelector<HTMLAnchorElement>("h3 a")?.focus({ preventScroll: true });
        });
      });
      // Lista → mapa: al pasar por una tarjeta se resalta su punto.
      const enTarjeta = (ev: Event) => {
        const ref = (ev.target as HTMLElement).closest<HTMLElement>("[data-ref]")?.dataset.ref ?? null;
        if (mapa?.getLayer("puntos")) mapa.setPaintProperty("puntos", "circle-radius", ["case", ["==", ["get", "ref"], ref ?? ""], 11, 7]);
      };
      document.addEventListener("pointerover", enTarjeta);
      document.addEventListener("focusin", enTarjeta);
      mapa.once("remove", () => {
        document.removeEventListener("pointerover", enTarjeta);
        document.removeEventListener("focusin", enTarjeta);
      });
    })();
    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [visible, puntos, formatoPrecio]);

  return <div ref={contenedor} className={s.mapa} role="region" aria-label={etiqueta} />;
}
