import type { Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import type { Filtros } from "@/portal/filtros";
import type { ResultadoBusqueda } from "@/portal/repositorio";
import { Aviso } from "@/ui/componentes";
import { FiltrosForm } from "./filtros-form";
import { MapaResultados } from "./mapa";
import { Paginacion } from "./paginacion";
import s from "./portal.module.css";
import { Tarjeta } from "./tarjeta";

export function Resultados({ f, r, titulo, locale, d }: { f: Filtros; r: ResultadoBusqueda; titulo: string; locale: Locale; d: Diccionario }) {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <header className={s.cabeceraResultados}>
        <h1>{titulo}</h1>
        <p className={s.total} role="status">
          {r.total === 1 ? d.buscar.resultado1 : t(d.buscar.resultados, { n: new Intl.NumberFormat(locale).format(r.total) })}
        </p>
      </header>
      <div className={s.disposicion}>
        <FiltrosForm f={f} locale={locale} d={d} />
        <div className={s.columnaResultados}>
          <div>
            {r.items.length === 0 ? (
              <div className={s.vacio}>
                <Aviso tipo="info" role="status">
                  <p>{d.buscar.sinResultados}</p>
                </Aviso>
              </div>
            ) : (
              <div className={s.lista}>
                <h2 className="visually-hidden">{d.buscar.listaResultados}</h2>
                {r.items.map((i, k) => (
                  <Tarjeta key={i.ref} i={i} locale={locale} d={d} prioridad={k < 2} />
                ))}
              </div>
            )}
            <Paginacion f={f} total={r.total} locale={locale} d={d} />
          </div>
          {r.puntos.length > 0 && <MapaResultados puntos={r.puntos} etiqueta={`${d.buscar.mapa} · ${titulo}`} formatoPrecio={f.operacion} />}
        </div>
      </div>
    </div>
  );
}
