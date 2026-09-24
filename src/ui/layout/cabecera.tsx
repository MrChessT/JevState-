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
      ["asistente", d.nav.asistente],
      ["agencia", d.nav.agencia],
    ] as Array<[Segmento, string]>
  ).filter(([seg]) => publicada(seg));
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
          </nav>
        )}
        <div className={s.herramientas}>
          <SelectorIdioma locale={locale} etiqueta={d.nav.idioma} />
          <SelectorTema textos={{ tema: d.nav.tema, claro: d.nav.temaClaro, oscuro: d.nav.temaOscuro, sistema: d.nav.temaSistema }} />
          <Link href={ruta(locale, "cuenta")}>{d.nav.cuenta}</Link>
        </div>
      </div>
    </header>
  );
}
