import type { Locale } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import { CARACTERISTICAS_FILTRO, ORDENES, TIPOS_BUSQUEDA, type Filtros } from "@/portal/filtros";
import { MUNICIPIOS } from "@/zonas/datos";
import s from "./portal.module.css";

/**
 * Formulario de filtros. Funciona sin JavaScript: GET a /api/buscar, que redirige a la URL canónica
 * (la zona y la operación van en la ruta).
 */
export function FiltrosForm({ f, locale, d, compacto }: { f: Filtros; locale: Locale; d: Diccionario; compacto?: boolean }) {
  const municipios = [...MUNICIPIOS].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return (
    <form action="/api/buscar" method="get" className={compacto ? s.buscadorRapido : s.filtros} aria-label={d.buscar.filtros}>
      <input type="hidden" name="lang" value={locale} />
      <label>
        <span>{d.buscar.operacion}</span>
        <select name="operacion" defaultValue={f.operacion}>
          <option value="venta">{d.buscar.comprar}</option>
          <option value="alquiler">{d.buscar.alquilar}</option>
        </select>
      </label>
      <label>
        <span>{d.buscar.zona}</span>
        <select name="zona" defaultValue={f.zona?.split("/")[0] ?? ""}>
          <option value="">{d.buscar.todas}</option>
          {municipios.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.nombre}
            </option>
          ))}
        </select>
        {f.zona?.includes("/") && <input type="hidden" name="barrio" value={f.zona} />}
      </label>
      <label>
        <span>{d.buscar.precioMax}</span>
        <input type="number" name="precio_max" inputMode="numeric" min={0} step={f.operacion === "venta" ? 5000 : 50} defaultValue={f.precioMax ?? ""} />
      </label>
      <label>
        <span>{d.buscar.habMin}</span>
        <select name="hab_min" defaultValue={f.habMin ?? ""}>
          <option value="">{d.buscar.cualquiera}</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{`${n}+`}</option>
          ))}
        </select>
      </label>
      {!compacto && (
        <>
          <label>
            <span>{d.buscar.precioMin}</span>
            <input type="number" name="precio_min" inputMode="numeric" min={0} step={f.operacion === "venta" ? 5000 : 50} defaultValue={f.precioMin ?? ""} />
          </label>
          <label>
            <span>{d.buscar.m2Min}</span>
            <input type="number" name="m2_min" inputMode="numeric" min={0} step={5} defaultValue={f.m2Min ?? ""} />
          </label>
          <fieldset>
            <legend>{d.buscar.tipo}</legend>
            {TIPOS_BUSQUEDA.map((tp) => (
              <label key={tp} className={s.check}>
                <input type="checkbox" name="tipo" value={tp} defaultChecked={f.tipos.includes(tp)} />
                {d.tipos[tp]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{d.buscar.con}</legend>
            {CARACTERISTICAS_FILTRO.map((c) => (
              <label key={c} className={s.check}>
                <input type="checkbox" name="con" value={c} defaultChecked={f.con.includes(c)} />
                {d.rasgos[c]}
              </label>
            ))}
          </fieldset>
          <label>
            <span>{d.buscar.orden}</span>
            <select name="orden" defaultValue={f.orden}>
              {ORDENES.map((o) => (
                <option key={o} value={o}>
                  {d.buscar.ordenes[o]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <button type="submit" className={s.botonBuscar}>
        {compacto ? d.buscar.buscar : d.buscar.aplicar}
      </button>
    </form>
  );
}
