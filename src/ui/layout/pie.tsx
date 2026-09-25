import Link from "next/link";
import { BRAND, NOMBRE_VISIBLE } from "@/config/brand";
import { publicada } from "@/config/secciones";
import { ruta, type Locale, type Segmento } from "@/i18n/config";
import { t, type Diccionario } from "@/i18n/diccionario";
import { zona } from "@/zonas/buscar";
import s from "./layout.module.css";

/** Municipios con más oferta en la región: enlaces directos a sus listados. */
const MUNICIPIOS = ["murcia", "cartagena", "lorca", "molina-de-segura", "san-javier", "aguilas"];

export function Pie({ locale, d, ficticios }: { locale: Locale; d: Diccionario; ficticios: boolean }) {
  const municipios = MUNICIPIOS.map((p) => zona(p)).filter((z): z is NonNullable<typeof z> => Boolean(z));
  const explorar = (
    [
      ["asistente", d.nav.asistente],
      ["zonas", d.zonas.titulo],
      ["agencia", d.nav.agencia],
      ["favoritos", d.favoritos.titulo],
      ["comparar", d.comparar.titulo],
    ] as Array<[Segmento, string]>
  ).filter(([seg]) => publicada(seg));
  return (
    <footer className={s.pie}>
      <div className="contenedor">
        <div className={s.pieColumnas}>
          <div className={s.pieMarca}>
            <strong>{NOMBRE_VISIBLE}</strong>
            <p>{d.pie.lema}</p>
            <p>
              {BRAND.contact.address}, {BRAND.contact.city}
              <br />
              <a href={`tel:${BRAND.contact.phone.replace(/\s/g, "")}`}>{BRAND.contact.phone}</a> · <a href={`mailto:${BRAND.contact.email}`}>{BRAND.contact.email}</a>
            </p>
          </div>
          {publicada("venta") && (
            <nav aria-label={d.pie.comprarEn}>
              <h2>{d.pie.comprarEn}</h2>
              <ul>
                {municipios.map((z) => (
                  <li key={z.path}>
                    <Link href={ruta(locale, "venta", z.path)}>{z.nombre}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {publicada("alquiler") && (
            <nav aria-label={d.pie.alquilarEn}>
              <h2>{d.pie.alquilarEn}</h2>
              <ul>
                {municipios.map((z) => (
                  <li key={z.path}>
                    <Link href={ruta(locale, "alquiler", z.path)}>{z.nombre}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {explorar.length > 0 && (
            <nav aria-label={d.pie.explorar}>
              <h2>{d.pie.explorar}</h2>
              <ul>
                {explorar.map(([seg, texto]) => (
                  <li key={seg}>
                    <Link href={ruta(locale, seg)}>{texto}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <nav aria-label={d.pie.legal}>
            <h2>{d.pie.legal}</h2>
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
        <div className={s.pieLegal}>
          <p>{t(d.pie.derechos, { anio: new Date().getFullYear() })}</p>
          {ficticios && <p>{d.pie.avisoFicticios}</p>}
        </div>
      </div>
    </footer>
  );
}
