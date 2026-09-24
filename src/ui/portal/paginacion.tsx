import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import { POR_PAGINA, urlFiltros, type Filtros } from "@/portal/filtros";
import s from "./portal.module.css";

export function Paginacion({ f, total, locale, d }: { f: Filtros; total: number; locale: Locale; d: Diccionario }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginas === 1) return null;
  return (
    <nav className={s.paginacion} aria-label={t(d.buscar.pagina, { n: f.pagina, total: paginas })}>
      {f.pagina > 1 ? <Link href={urlFiltros(locale, f, { pagina: f.pagina - 1 })} rel="prev">← {d.buscar.anterior}</Link> : <span aria-hidden="true" />}
      <span aria-current="page">{t(d.buscar.pagina, { n: f.pagina, total: paginas })}</span>
      {f.pagina < paginas ? <Link href={urlFiltros(locale, f, { pagina: f.pagina + 1 })} rel="next">{d.buscar.siguiente} →</Link> : <span aria-hidden="true" />}
    </nav>
  );
}
