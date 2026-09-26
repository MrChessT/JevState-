import s from "./esqueleto.module.css";

/** Esqueleto de listado mientras llega la página (navegación entre búsquedas y fichas). */
export function EsqueletoListado() {
  return (
    <div className={`contenedor ${s.pagina}`} aria-busy="true" aria-live="polite">
      <div className={`${s.bloque} ${s.titulo}`} />
      <div className={s.rejilla}>
        {Array.from({ length: 6 }, (_, k) => (
          <div key={k} className={s.tarjeta}>
            <div className={`${s.bloque} ${s.foto}`} />
            <div className={`${s.bloque} ${s.linea}`} style={{ width: "45%" }} />
            <div className={`${s.bloque} ${s.linea}`} style={{ width: "80%" }} />
            <div className={`${s.bloque} ${s.linea}`} style={{ width: "60%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Solo la rejilla de tarjetas (favoritos mientras cargan). */
export function EsqueletoTarjetas({ n = 3 }: { n?: number }) {
  return (
    <div className={s.rejilla} aria-busy="true">
      {Array.from({ length: n }, (_, k) => (
        <div key={k} className={s.tarjeta}>
          <div className={`${s.bloque} ${s.foto}`} />
          <div className={`${s.bloque} ${s.linea}`} style={{ width: "45%" }} />
          <div className={`${s.bloque} ${s.linea}`} style={{ width: "80%" }} />
        </div>
      ))}
    </div>
  );
}
