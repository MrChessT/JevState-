"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useListaLocal } from "@/ui/portal/lista-local";
import s from "./visual.module.css";

/** Barra flotante con los inmuebles elegidos para comparar (1–3), en todas las páginas. */
export function BarraComparador({ href, textos }: { href: string; textos: { comparar: string; elegidos: string; vaciar: string } }) {
  const { lista, vaciar } = useListaLocal("comparar", 3);
  const pathname = usePathname();
  if (!lista.length || pathname === href) return null;
  return (
    <div className={s.comparador} role="region" aria-label={textos.comparar}>
      <span className={s.comparadorPuntos} aria-hidden="true">
        {[0, 1, 2].map((k) => (
          <i key={k} data-lleno={k < lista.length ? "" : undefined} />
        ))}
      </span>
      <span className={s.comparadorTexto}>{textos.elegidos.replace("{n}", String(lista.length))}</span>
      <button type="button" onClick={vaciar}>
        {textos.vaciar}
      </button>
      <Link href={href}>{textos.comparar} →</Link>
    </div>
  );
}
