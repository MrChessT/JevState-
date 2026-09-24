/** Solo se permiten redirecciones internas («/cuenta», «/en/account»): nunca a otro dominio. */
export function destinoSeguro(next: string | null | undefined, porDefecto = "/"): string {
  if (!next) return porDefecto;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return porDefecto;
  try {
    const url = new URL(next, "http://interno.invalid");
    if (url.origin !== "http://interno.invalid") return porDefecto;
    return url.pathname + url.search;
  } catch {
    return porDefecto;
  }
}
