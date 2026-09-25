import s from "./visual.module.css";

/**
 * Dónde queda un valor (p. ej. €/m² de un inmueble) frente a la zona: banda p25–p75 y marcador.
 * Solo con datos reales de la zona; si falta alguno, no se dibuja.
 */
export function RangoPrecio({ valor, p25, p75, mediana, etiquetaValor, textos }: { valor: number; p25: number; p75: number; mediana: number; etiquetaValor: string; textos: { barato: string; caro: string; descripcion: string } }) {
  const min = Math.min(valor, p25) * 0.85;
  const max = Math.max(valor, p75) * 1.1;
  const pos = (x: number) => `${(((x - min) / (max - min)) * 100).toFixed(1)}%`;
  return (
    <figure className={s.rango} style={{ margin: 0 }}>
      <div className={s.rangoPista} role="img" aria-label={textos.descripcion}>
        <span className={s.rangoBanda} style={{ left: pos(p25), width: `calc(${pos(p75)} - ${pos(p25)})` }} />
        <span className={s.rangoMarca} style={{ left: pos(valor) }}>
          {etiquetaValor}
        </span>
        <span style={{ position: "absolute", left: pos(mediana), top: -3, bottom: -3, width: 2, background: "var(--texto-tenue)", borderRadius: 2 }} aria-hidden="true" />
      </div>
      <div className={s.rangoEjes} aria-hidden="true">
        <span>{textos.barato}</span>
        <span>{textos.caro}</span>
      </div>
      <figcaption className={s.rangoTexto}>{textos.descripcion}</figcaption>
    </figure>
  );
}
