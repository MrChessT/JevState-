"use client";

// Último recurso: error en el layout raíz. Sin estilos del sitio (el layout no ha cargado).
export default function ErrorGlobal({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#fafaf8", color: "#1b1a17" }}>
        <main style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 28 }}>Algo ha fallado · Something went wrong</h1>
          <p>Vuelve a intentarlo en unos segundos. · Please try again in a few seconds.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 999, border: 0, background: "#1f4e5f", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Reintentar · Try again
          </button>
        </main>
      </body>
    </html>
  );
}
