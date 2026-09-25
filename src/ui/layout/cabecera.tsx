import Link from "next/link";
import { BRAND } from "@/config/brand";
import { publicada } from "@/config/secciones";
import { ruta, type Locale, type Segmento } from "@/i18n/config";
import type { Diccionario } from "@/i18n/diccionario";
import s from "./layout.module.css";
import { SelectorIdioma, SelectorTema } from "./selectores";

export function Cabecera({ locale, d }: { locale: Locale; d: Diccionario }) {
  const enlaces = (
    [
      ["venta", d.nav.comprar],
      ["alquiler", d.nav.alquilar],
      ["valorar", d.nav.vender],
      ["zonas", d.zonas.titulo],
      ["agencia", d.nav.agencia],
    ] as Array<[Segmento, string]>
  ).filter(([seg]) => publicada(seg));
  const asistente = publicada("asistente");
  return (
    <header className={s.cabecera}>
      <div className={`contenedor ${s.barra}`}>
        <Link href={ruta(locale)} className={s.logo}>
          <span className={s.logoMarca} aria-hidden="true">
            {BRAND.name.replace(/[^\p{L}]/gu, "").charAt(0) || "·"}
          </span>
          <span className={s.logoTexto}>{BRAND.name}</span>
        </Link>
        {enlaces.length > 0 && (
          <nav aria-label={d.nav.principal} className={s.nav}>
            {enlaces.map(([seg, texto]) => (
              <Link key={seg} href={ruta(locale, seg)}>
                {texto}
              </Link>
            ))}
            {asistente && (
              <Link href={ruta(locale, "asistente")} className={s.navAsistente}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
                </svg>
                {d.nav.asistente}
              </Link>
            )}
          </nav>
        )}
        <div className={s.herramientas}>
          <SelectorIdioma locale={locale} etiqueta={d.nav.idioma} />
          <SelectorTema textos={{ tema: d.nav.tema, claro: d.nav.temaClaro, oscuro: d.nav.temaOscuro, sistema: d.nav.temaSistema }} />
          {publicada("favoritos") && (
            <Link href={ruta(locale, "favoritos")} className={s.icono} aria-label={d.favoritos.titulo} title={d.favoritos.titulo}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
              </svg>
            </Link>
          )}
          <Link href={ruta(locale, "cuenta")} className={s.cuenta}>
            {d.nav.cuenta}
          </Link>
          {enlaces.length > 0 && (
            <details className={s.menu}>
              <summary aria-label={d.nav.menu} title={d.nav.menu}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </summary>
              <nav aria-label={d.nav.menu} className={s.menuPanel}>
                {asistente && <Link href={ruta(locale, "asistente")}>{d.nav.asistente}</Link>}
                {enlaces.map(([seg, texto]) => (
                  <Link key={seg} href={ruta(locale, seg)}>
                    {texto}
                  </Link>
                ))}
                {publicada("favoritos") && <Link href={ruta(locale, "favoritos")}>{d.favoritos.titulo}</Link>}
                <Link href={ruta(locale, "cuenta")}>{d.nav.cuenta}</Link>
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
