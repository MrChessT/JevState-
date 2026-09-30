// Textos de los emails de contacto (plantillas, sin texto libre de un modelo).
import { NOMBRE_VISIBLE } from "@/config/brand";
import type { SolicitudContacto } from "./solicitud";

const FRANJA = { es: { manana: "por la mañana", tarde: "por la tarde", indiferente: "a cualquier hora" }, en: { manana: "in the morning", tarde: "in the afternoon", indiferente: "at any time" } };
const TIPO = { contacto: "Petición de información", visita: "Solicitud de visita", pregunta_no_consta: "Pregunta sobre un dato que no consta" };

/** Aviso interno para la agencia (siempre en español). */
export function emailAgencia(s: SolicitudContacto, url: string | null, persistente: boolean): { asunto: string; texto: string } {
  const lineas = [
    `${TIPO[s.tipo]}${s.ref ? ` · ${s.ref}` : ""}`,
    "",
    `Nombre: ${s.nombre}`,
    s.email ? `Email: ${s.email}` : null,
    s.telefono ? `Teléfono: ${s.telefono}` : null,
    s.tipo === "visita" ? `Visita: ${s.fecha || "sin fecha"} ${FRANJA.es[s.franja]}` : null,
    s.campo ? `Dato que pregunta: ${s.campo}` : null,
    s.mensaje ? `\nMensaje:\n${s.mensaje}` : null,
    url ? `\nInmueble: ${url}` : null,
    `\nOrigen: ${s.origen === "asistente" ? "asistente" : "formulario de la web"} · idioma: ${s.locale}`,
    persistente ? "Guardado en el CRM." : "Aviso: entorno de demostración sin base de datos (no se ha guardado en el CRM).",
  ];
  return { asunto: `[${NOMBRE_VISIBLE}] ${TIPO[s.tipo]}${s.ref ? ` ${s.ref}` : ""} · ${s.nombre}`, texto: lineas.filter((x) => x !== null).join("\n") };
}

/** Confirmación para quien escribe (en su idioma). */
export function emailCliente(s: SolicitudContacto, url: string | null): { asunto: string; texto: string } {
  if (s.locale === "en") {
    return {
      asunto: `We've received your ${s.tipo === "visita" ? "viewing request" : "message"} · ${NOMBRE_VISIBLE}`,
      texto: [
        `Hello ${s.nombre},`,
        "",
        s.tipo === "visita" ? `We've received your request to view ${s.ref ?? "the property"}${s.fecha ? ` on ${s.fecha} ${FRANJA.en[s.franja]}` : ""}. An agent will contact you to confirm the time.` : "We've received your message. An agent will reply within 24 working hours.",
        url ? `\nProperty: ${url}` : "",
        "",
        `${NOMBRE_VISIBLE}`,
        "You are receiving this email because you contacted us. We only use your details to answer this request.",
      ].join("\n"),
    };
  }
  return {
    asunto: `Hemos recibido tu ${s.tipo === "visita" ? "solicitud de visita" : "mensaje"} · ${NOMBRE_VISIBLE}`,
    texto: [
      `Hola, ${s.nombre}:`,
      "",
      s.tipo === "visita" ? `Hemos recibido tu solicitud para visitar ${s.ref ?? "el inmueble"}${s.fecha ? ` el ${s.fecha} ${FRANJA.es[s.franja]}` : ""}. Un agente te contactará para confirmar la hora.` : "Hemos recibido tu mensaje. Un agente te responderá en menos de 24 horas laborables.",
      url ? `\nInmueble: ${url}` : "",
      "",
      `${NOMBRE_VISIBLE}`,
      "Recibes este email porque nos has escrito. Solo usamos tus datos para atender esta petición.",
    ].join("\n"),
  };
}
