import Link from "next/link";
import { BRAND } from "@/config/brand";
import { notFound } from "next/navigation";
import { publicada } from "@/config/secciones";
import { isLocale, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { portal } from "@/portal/datos";
import { leerFiltros } from "@/portal/filtros";
import type { InmuebleResumen } from "@/portal/tipos";
import { PromptInicio } from "@/ui/asistente/prompt-inicio";
import { Aviso, BotonEnlace } from "@/ui/componentes";
import { FiltrosForm } from "@/ui/portal/filtros-form";
import { euros, numero } from "@/ui/portal/formato";
import ps from "@/ui/portal/portal.module.css";
import { Tarjeta as TarjetaInmueble } from "@/ui/portal/tarjeta";
import { zona } from "@/zonas/buscar";
import s from "./inicio.module.css";

// Datos del portal: se regeneran cada 10 minutos (ISR).
export const revalidate = 600;

const MUNICIPIOS_DESTACADOS = ["murcia", "cartagena", "molina-de-segura", "lorca", "san-javier", "aguilas"];

const ICONOS_PROMESA = [
  <path key="0" d="M9 12l2 2 4-4M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />,
  <path key="1" d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />,
  <path key="2" d="M4 12h16M12 4v16" />,
];

export default async function Inicio({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = await diccionario(lang);
  const conPortal = publicada("venta");
  const repo = conPortal ? await portal() : null;
  const todos: InmuebleResumen[] = repo ? await repo.todas() : [];
  const destacados = repo ? await repo.destacados(8) : [];
  const enVenta = todos.filter((i) => i.operacion === "venta").length;
  const enAlquiler = todos.filter((i) => i.operacion === "alquiler").length;
  const municipiosConOferta = new Set(todos.map((i) => i.zonaPath.split("/")[0])).size;
  const zonas = repo
    ? (
        await Promise.all(
          MUNICIPIOS_DESTACADOS.map(async (path) => {
            const z = zona(path);
            const est = await repo.estadistica(path, "venta");
            return z && est.n > 0 ? { path, nombre: z.nombre, n: est.n, mediana: est.medianaM2 } : null;
          }),
        )
      ).filter((z): z is NonNullable<typeof z> => Boolean(z))
    : [];
  const portada = destacados.find((i) => i.foto) ?? null;
  const confirmados = portada ? portada.rasgos.filter((r) => r.status === "confirmado").slice(0, 2) : [];

  return (
    <>
      <section className={s.heroe}>
        <div className={`contenedor ${s.heroeRejilla}`}>
          <div className={s.heroeTexto}>
            {todos.length > 0 && <p className={s.antetitulo}>{t(d.inicio.antetitulo, { n: numero(lang, todos.length) })}</p>}
            <h1>{d.inicio.titulo}</h1>
            <p className={s.subtitulo}>{d.inicio.subtitulo}</p>
            {publicada("asistente") ? (
              <PromptInicio destino={ruta(lang, "asistente")} textos={{ etiqueta: d.inicio.promptEtiqueta, placeholder: d.inicio.promptPlaceholder, boton: d.inicio.promptBoton, ejemplos: d.asistente.ejemplos }} />
            ) : !conPortal ? (
              <Aviso tipo="info" role="status">
                <p>{d.inicio.enPreparacion}</p>
              </Aviso>
            ) : null}
          </div>
          {portada && (
            <div className={s.heroeVisual} aria-hidden="true">
              <div className={s.visualFoto}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ilustración decorativa */}
                <img src={portada.foto!} alt="" width={560} height={420} />
              </div>
              <div className={s.visualTarjeta}>
                <strong>{euros(lang, portada.precio)}</strong>
                <span>{portada.titulo}</span>
                <ul>
                  {confirmados.map((r) => (
                    <li key={r.campo}>✓ {(d.rasgos as Record<string, string>)[r.campo] ?? r.campo} · {d.confianza.confirmado.toLowerCase()}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      {conPortal && (
        <section className={`contenedor ${s.busquedaClasica}`} aria-labelledby="filtros-clasicos">
          <h2 id="filtros-clasicos" className={s.etiquetaSeccion}>
            {d.inicio.prefieresFiltros}
          </h2>
          <FiltrosForm f={leerFiltros("venta", undefined, {})} locale={lang} d={d} compacto />
        </section>
      )}

      {todos.length > 0 && (
        <section className={`contenedor ${s.cifras}`} aria-label={d.inicio.promesasTitulo}>
          <dl>
            <div>
              <dt>{d.inicio.cifras.venta}</dt>
              <dd>{numero(lang, enVenta)}</dd>
            </div>
            <div>
              <dt>{d.inicio.cifras.alquiler}</dt>
              <dd>{numero(lang, enAlquiler)}</dd>
            </div>
            <div>
              <dt>{d.inicio.cifras.municipios}</dt>
              <dd>{numero(lang, municipiosConOferta)}</dd>
            </div>
            <div>
              <dt>{d.inicio.cifras.fuente}</dt>
              <dd>100 %</dd>
            </div>
          </dl>
        </section>
      )}

      {destacados.length > 0 && (
        <section className={`contenedor ${s.seccion}`} aria-labelledby="destacados">
          <div className={s.seccionCabecera}>
            <div>
              <h2 id="destacados">{d.buscar.tituloVenta}</h2>
              <p>{d.inicio.destacadosTexto}</p>
            </div>
            <BotonEnlace href={ruta(lang, "venta")} variante="secundario">
              {d.buscar.tituloVenta} →
            </BotonEnlace>
          </div>
          <div className={ps.lista}>
            {destacados.map((i, k) => (
              <TarjetaInmueble key={i.ref} i={i} locale={lang} d={d} prioridad={k < 2} />
            ))}
          </div>
        </section>
      )}

      {zonas.length > 0 && (
        <section className={`contenedor ${s.seccion}`} aria-labelledby="zonas-destacadas">
          <div className={s.seccionCabecera}>
            <div>
              <h2 id="zonas-destacadas">{d.inicio.zonasTitulo}</h2>
              <p>{d.inicio.zonasTexto}</p>
            </div>
            {publicada("zonas") && (
              <BotonEnlace href={ruta(lang, "zonas")} variante="secundario">
                {d.zonas.titulo} →
              </BotonEnlace>
            )}
          </div>
          <ul className={s.zonas}>
            {zonas.map((z, k) => (
              <li key={z.path} data-tono={k % 3}>
                <Link href={ruta(lang, "venta", z.path)} className={s.zona} aria-label={t(d.inicio.verZona, { zona: z.nombre })}>
                  <span className={s.zonaNombre}>{z.nombre}</span>
                  <span className={s.zonaDatos}>
                    {t(d.inicio.zonaInmuebles, { n: z.n })}
                    {z.mediana && <> · {t(d.inicio.zonaMediana, { precio: euros(lang, Number(z.mediana)) ?? "" })}</>}
                  </span>
                  <span className={s.zonaFlecha} aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`contenedor ${s.seccion}`} aria-labelledby="promesas">
        <div className={s.seccionCabecera}>
          <div>
            <h2 id="promesas">{d.inicio.promesasTitulo}</h2>
            <p>{d.inicio.comoTexto}</p>
          </div>
        </div>
        <ol className={s.promesas}>
          {d.inicio.promesas.map((p, k) => (
            <li key={p.titulo}>
              <span className={s.promesaIcono} aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  {ICONOS_PROMESA[k]}
                </svg>
              </span>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`contenedor ${s.seccion}`} aria-labelledby="captacion">
        <div className={s.captacion}>
          <div>
            <h2 id="captacion">{d.inicio.captacionTitulo}</h2>
            <p>{d.inicio.captacionTexto}</p>
          </div>
          <div>
            {publicada("valorar") ? (
              <BotonEnlace href={ruta(lang, "valorar")} variante="acento">
                {d.inicio.ctaValorar}
              </BotonEnlace>
            ) : (
              <a className={s.captacionBoton} href={`mailto:${BRAND.contact.email}`}>
                {d.pie.contacto} →
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
