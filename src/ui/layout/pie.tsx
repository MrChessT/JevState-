import Link from "next/link";
import { BRAND } from "@/config/brand";
import { ruta, type Locale } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import s from "./layout.module.css";

export function Pie({ locale, d, ficticios }: { locale: Locale; d: Diccionario; ficticios: boolean }) {
  return (
    <footer className={s.pie}>
      <div className={`contenedor ${s.pieFilas}`}>
        <div>
          <p>{t(d.pie.derechos, { anio: new Date().getFullYear() })}</p>
          <p>
            {BRAND.contact.address}, {BRAND.contact.city} · <a href={`tel:${BRAND.contact.phone.replace(/\s/g, "")}`}>{BRAND.contact.phone}</a> ·{" "}
            <a href={`mailto:${BRAND.contact.email}`}>{BRAND.contact.email}</a>
          </p>
          {ficticios && <p>{d.pie.avisoFicticios}</p>}
        </div>
        <nav aria-label={d.pie.legal}>
          <ul>
            <li>
              <Link href={ruta(locale, "legal", "aviso-legal")}>{d.pie.avisoLegal}</Link>
            </li>
            <li>
              <Link href={ruta(locale, "legal", "privacidad")}>{d.pie.privacidad}</Link>
            </li>
            <li>
              <Link href={ruta(locale, "legal", "cookies")}>{d.pie.cookies}</Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
