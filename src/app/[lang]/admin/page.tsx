import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ASSISTANT_CATALOG_VERSION } from "@/asistente/version";
import { CATALOG_VERSION } from "@/catalog/index";
import { isLocale, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { sesion } from "@/lib/supabase/server";
import { Aviso, Tarjeta } from "@/ui/componentes";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  return { title: d.admin.titulo, robots: { index: false, follow: false } };
}

export default async function Admin({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const actual = await sesion();
  if (!actual) redirect(ruta(lang, "cuenta", "entrar"));
  const d = await diccionario(lang);
  const membresia = actual.membresias[0];
  if (!membresia) {
    return (
      <div className="contenedor texto-largo" style={{ paddingBlock: "var(--e-7)" }}>
        <h1>{d.admin.titulo}</h1>
        <Aviso tipo="error" role="alert">
          <p>{d.admin.sinPermiso}</p>
        </Aviso>
      </div>
    );
  }
  // Qué ve cada rol (sección 2.3): el editor no ve el CRM ni la auditoría.
  const secciones = (Object.keys(d.admin.secciones) as Array<keyof typeof d.admin.secciones>).filter(
    (s) => membresia.role === "admin" || (membresia.role === "agente" ? s !== "auditoria" && s !== "catalogo" : s === "inmuebles" || s === "revision"),
  );
  return (
    <div className="contenedor" style={{ paddingBlock: "var(--e-7)", display: "grid", gap: "var(--e-5)" }}>
      <header>
        <h1>{d.admin.titulo}</h1>
        <p style={{ color: "var(--texto-suave)" }}>
          {membresia.display_name} · {d.admin.rol[membresia.role]}
        </p>
      </header>
      <div style={{ display: "grid", gap: "var(--e-4)", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))" }}>
        {secciones.map((s) => (
          <Tarjeta key={s}>
            <h2 style={{ fontSize: "var(--t-lg)" }}>{d.admin.secciones[s]}</h2>
            <p style={{ color: "var(--texto-suave)", margin: 0 }}>{d.admin.proximamente}</p>
          </Tarjeta>
        ))}
      </div>
      <p style={{ color: "var(--texto-tenue)", fontSize: "var(--t-sm)" }}>{t(d.admin.catalogoVersion, { datos: CATALOG_VERSION, asistente: ASSISTANT_CATALOG_VERSION })}</p>
    </div>
  );
}
