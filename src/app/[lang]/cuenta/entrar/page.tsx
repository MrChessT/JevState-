import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, ruta } from "@/i18n/config";
import { diccionario } from "@/i18n/diccionario";
import { sesion } from "@/lib/supabase/server";
import { Aviso } from "@/ui/componentes";
import { FormularioEnlace } from "./formulario";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  return { title: d.cuenta.entrarTitulo, robots: { index: false } };
}

export default async function Entrar({ params, searchParams }: PageProps<"/[lang]/cuenta/entrar">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  if (await sesion()) redirect(ruta(lang, "cuenta"));
  const d = await diccionario(lang);
  const { error } = await searchParams;
  return (
    <div className="contenedor" style={{ maxWidth: "28rem", paddingBlock: "var(--e-7)" }}>
      <h1>{d.cuenta.entrarTitulo}</h1>
      <p>{d.cuenta.entrarTexto}</p>
      {error === "enlace" && (
        <div style={{ marginBottom: "var(--e-4)" }}>
          <Aviso tipo="error" role="alert">
            <p>{d.cuenta.enlaceCaducado}</p>
          </Aviso>
        </div>
      )}
      <FormularioEnlace
        lang={lang}
        textos={{
          email: d.cuenta.email,
          enviar: d.cuenta.enviar,
          enviando: d.cuenta.enviando,
          enviado: d.cuenta.enviado,
          emailNoValido: d.cuenta.emailNoValido,
          error: d.cuenta.error,
          noConfigurada: d.cuenta.noConfigurada,
        }}
      />
    </div>
  );
}
