"use client";

// Error inesperado en una página: mensaje con la marca, en el idioma de la ruta, y reintento.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { EstadoVacioCliente } from "@/ui/visual/vacio-cliente";

const TEXTOS = {
  es: { titulo: "Algo ha fallado al cargar esta página", texto: "Puede ser un problema momentáneo. Vuelve a intentarlo; si continúa, escríbenos y lo revisamos.", reintentar: "Reintentar", inicio: "Ir al inicio" },
  en: { titulo: "Something went wrong loading this page", texto: "It may be a temporary problem. Please try again; if it keeps happening, write to us and we'll look into it.", reintentar: "Try again", inicio: "Go to the home page" },
} as const;

export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ lang?: string }>();
  const lang = params?.lang === "en" ? "en" : "es";
  const t = TEXTOS[lang];
  useEffect(() => {
    console.error("pagina.error", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="contenedor" style={{ paddingBlock: "var(--e-8)" }}>
      <EstadoVacioCliente icono="aviso" titulo={t.titulo} texto={t.texto}>
        <button type="button" onClick={reset}>
          {t.reintentar}
        </button>
        <Link href={lang === "es" ? "/" : "/en"}>{t.inicio}</Link>
      </EstadoVacioCliente>
    </div>
  );
}
