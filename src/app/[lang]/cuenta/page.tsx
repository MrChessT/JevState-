import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BRAND } from "@/config/brand";
import { isLocale, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { sesion } from "@/lib/supabase/server";
import { Boton, Tarjeta } from "@/ui/componentes";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  return { title: d.cuenta.titulo, robots: { index: false } };
}

export default async function Cuenta({ params }: PageProps<"/[lang]/cuenta">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const actual = await sesion();
  if (!actual) redirect(ruta(lang, "cuenta", "entrar"));
  const d = await diccionario(lang);
  return (
    <div className="contenedor texto-largo" style={{ paddingBlock: "var(--e-7)", display: "grid", gap: "var(--e-5)" }}>
      <h1>{d.cuenta.titulo}</h1>
      <Tarjeta>
        <p>{t(d.cuenta.sesionComo, { email: actual.email ?? "—" })}</p>
        <p style={{ color: "var(--texto-suave)" }}>{d.cuenta.queGuardas}</p>
        <form action="/auth/salir" method="post">
          <input type="hidden" name="next" value={ruta(lang)} />
          <Boton type="submit" variante="secundario" pequeno>
            {d.cuenta.salir}
          </Boton>
        </form>
      </Tarjeta>
      <Tarjeta>
        <h2 style={{ fontSize: "var(--t-lg)" }}>{d.cuenta.tusDatos}</h2>
        <p>{t(d.cuenta.tusDatosTexto, { email: BRAND.contact.email })}</p>
      </Tarjeta>
    </div>
  );
}
