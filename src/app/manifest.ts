import type { MetadataRoute } from "next";
import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE_VISIBLE,
    short_name: NOMBRE_VISIBLE.split(" ")[0] ?? NOMBRE_VISIBLE,
    description: "Pisos, casas y locales en venta y alquiler en la Región de Murcia, con un asistente que explica cada recomendación.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf8",
    theme_color: BRAND.primaryColor,
    lang: "es",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
