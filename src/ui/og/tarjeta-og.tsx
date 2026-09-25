// Imagen para compartir (Open Graph, 1200×630): fondo de marca, símbolo, título y datos. Se genera
// con next/og; solo estilos en línea y flexbox (lo que soporta el motor de ImageResponse).
import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";

export const TAM_OG = { width: 1200, height: 630 };

export function TarjetaOg({ antetitulo, titulo, subtitulo, datos, precio }: { antetitulo: string; titulo: string; subtitulo?: string; datos?: string[]; precio?: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, color: "#fff", background: `linear-gradient(135deg, ${BRAND.primaryColor} 0%, #0c2229 70%, ${BRAND.accentColor} 140%)`, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>⌂</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{NOMBRE_VISIBLE}</div>
          <div style={{ fontSize: 20, opacity: 0.75, letterSpacing: 2, textTransform: "uppercase" }}>{antetitulo}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {precio && <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>{precio}</div>}
        <div style={{ fontSize: precio ? 46 : 72, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 30, opacity: 0.85, maxWidth: 1000 }}>{subtitulo}</div>}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {(datos ?? []).map((d) => (
          <div key={d} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.3)", fontSize: 26 }}>
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}
