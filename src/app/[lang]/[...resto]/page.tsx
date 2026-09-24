import { notFound } from "next/navigation";

// Cualquier ruta sin página dentro de un idioma: 404 con el diseño del portal.
export default function Resto() {
  notFound();
}
