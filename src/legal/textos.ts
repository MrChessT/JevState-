// Textos legales base (LSSI-CE, RGPD/LOPDGDD). Son una plantilla sólida pero DEBEN revisarse por
// un profesional antes de publicar: la página lo indica mientras `revisado` sea false.
// Variables: {marca}, {razon}, {nif}, {direccion}, {email}, {registro}.
import type { Locale } from "@/i18n/config";

export type DocLegal = "aviso-legal" | "privacidad" | "cookies";
export const DOCS_LEGALES: DocLegal[] = ["aviso-legal", "privacidad", "cookies"];

export interface TextoLegal {
  titulo: string;
  secciones: Array<{ titulo: string; parrafos: string[] }>;
}

export const LEGAL_ACTUALIZADO = "2026-09-24";
export const LEGAL_REVISADO = false;

export const TEXTOS_LEGALES: Record<DocLegal, Record<Locale, TextoLegal>> = {
  "aviso-legal": {
    es: {
      titulo: "Aviso legal",
      secciones: [
        { titulo: "Titular del sitio", parrafos: ["En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), te informamos de que este sitio web pertenece a {razon} (en adelante, {marca}), con NIF {nif} y domicilio en {direccion}. Contacto: {email}.", "{registro}"] },
        { titulo: "Objeto", parrafos: ["El sitio ofrece información sobre inmuebles en venta y alquiler, un asistente de búsqueda, una valoración orientativa de viviendas y medios para contactar con la agencia."] },
        { titulo: "Información de los inmuebles", parrafos: ["Los datos de cada inmueble proceden de la ficha preparada por la agencia y se muestran con su estado (confirmado, probable o no consta). No constituyen una oferta vinculante. Las superficies, precios y características deben confirmarse con el agente antes de cualquier decisión.", "La valoración orientativa y la calculadora de hipoteca son estimaciones informativas: no son una tasación oficial ni una oferta de financiación."] },
        { titulo: "Propiedad intelectual", parrafos: ["Los textos, fotografías, planos y demás contenidos del sitio pertenecen a {marca} o a sus legítimos titulares. No se permite su reproducción sin autorización."] },
        { titulo: "Responsabilidad", parrafos: ["{marca} no se hace responsable de los daños derivados de un uso indebido del sitio ni de interrupciones técnicas ajenas a su control. Los enlaces a sitios de terceros se ofrecen solo como referencia."] },
        { titulo: "Legislación aplicable", parrafos: ["Este aviso se rige por la legislación española. Para cualquier controversia serán competentes los juzgados y tribunales que correspondan conforme a la normativa de consumidores y usuarios."] },
      ],
    },
    en: {
      titulo: "Legal notice",
      secciones: [
        { titulo: "Website owner", parrafos: ["In accordance with Spanish Law 34/2002 on information society services and electronic commerce (LSSI-CE), this website belongs to {razon} (hereinafter, {marca}), tax ID {nif}, registered address {direccion}. Contact: {email}.", "{registro}"] },
        { titulo: "Purpose", parrafos: ["The website provides information about properties for sale and rent, a search assistant, an indicative home valuation and ways to contact the agency."] },
        { titulo: "Property information", parrafos: ["Each property's details come from the listing prepared by the agency and are shown with their status (confirmed, likely or not stated). They are not a binding offer. Sizes, prices and features must be confirmed with the agent before making any decision.", "The indicative valuation and the mortgage calculator are informative estimates: they are neither an official appraisal nor a financing offer."] },
        { titulo: "Intellectual property", parrafos: ["The texts, photographs, floor plans and other content on the website belong to {marca} or their rightful owners. They may not be reproduced without permission."] },
        { titulo: "Liability", parrafos: ["{marca} is not liable for damage arising from misuse of the website or from technical interruptions beyond its control. Links to third-party websites are provided for reference only."] },
        { titulo: "Governing law", parrafos: ["This notice is governed by Spanish law. Any dispute shall be heard by the courts that are competent under consumer protection rules."] },
      ],
    },
  },
  privacidad: {
    es: {
      titulo: "Política de privacidad",
      secciones: [
        { titulo: "Responsable del tratamiento", parrafos: ["{razon}, con NIF {nif} y domicilio en {direccion}. Correo de contacto para protección de datos: {email}."] },
        { titulo: "Qué datos tratamos y para qué", parrafos: [
          "Contacto y visitas: nombre, teléfono o email y el mensaje que nos envías, para atender tu solicitud sobre un inmueble. Base legal: tu consentimiento, que registramos en el momento de enviarla.",
          "Alertas: tu email y los criterios de búsqueda, para avisarte de inmuebles nuevos. Base legal: tu consentimiento, con doble confirmación. Puedes darte de baja en cada email.",
          "Cuenta (opcional): tu email para el enlace de acceso, favoritos, búsquedas guardadas e historial del asistente. Base legal: la relación que tú inicias al crearla.",
          "Asistente: los mensajes que escribes, para responderte y mejorar el servicio. Las conversaciones sin cuenta se borran automáticamente a los 30 días.",
          "Valoración de tu vivienda: los datos del inmueble que nos das y, si lo pides, tus datos de contacto para que un agente te llame.",
        ] },
        { titulo: "Minimización y no discriminación", parrafos: ["Solo pedimos lo necesario para cada acción. El asistente no deduce tu perfil de tu edad, origen, idioma, nombre ni ninguna característica personal, y no filtra inmuebles por la composición del vecindario. Solo usa para qué o para quién es la vivienda si tú lo dices."] },
        { titulo: "Encargados del tratamiento", parrafos: ["Usamos proveedores con contrato de encargo de tratamiento (DPA): alojamiento y base de datos, envío de emails y el servicio de modelos que interpreta tus mensajes. A este último nunca le enviamos tu teléfono ni tu email."] },
        { titulo: "Conservación", parrafos: ["Conservamos los datos mientras sean necesarios para la finalidad y, después, bloqueados durante los plazos legales. Las conversaciones anónimas se borran a los 30 días."] },
        { titulo: "Tus derechos", parrafos: ["Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a {email} o desde tu cuenta. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es)."] },
      ],
    },
    en: {
      titulo: "Privacy policy",
      secciones: [
        { titulo: "Data controller", parrafos: ["{razon}, tax ID {nif}, registered address {direccion}. Data protection contact: {email}."] },
        { titulo: "What data we process and why", parrafos: [
          "Contact and viewings: your name, phone or email and your message, to handle your request about a property. Legal basis: your consent, which we record when you send it.",
          "Alerts: your email and search criteria, to tell you about new properties. Legal basis: your consent, with double opt-in. You can unsubscribe from any email.",
          "Account (optional): your email for the sign-in link, favourites, saved searches and assistant history. Legal basis: the relationship you start by creating it.",
          "Assistant: the messages you write, to answer you and improve the service. Conversations without an account are deleted automatically after 30 days.",
          "Home valuation: the property details you give us and, if you ask for it, your contact details so an agent can call you.",
        ] },
        { titulo: "Data minimisation and non-discrimination", parrafos: ["We only ask for what each action needs. The assistant does not infer your profile from your age, origin, language, name or any personal characteristic, and it does not filter properties by the make-up of the neighbourhood. It only uses what the home is for, or who it is for, if you say so."] },
        { titulo: "Processors", parrafos: ["We use providers bound by data processing agreements (DPA): hosting and database, email delivery and the model service that interprets your messages. We never send your phone number or email to the latter."] },
        { titulo: "Retention", parrafos: ["We keep data for as long as the purpose requires and then, blocked, for the legally required periods. Anonymous conversations are deleted after 30 days."] },
        { titulo: "Your rights", parrafos: ["You can exercise your rights of access, rectification, erasure, objection, restriction and portability by writing to {email} or from your account. You may also complain to the Spanish Data Protection Agency (www.aepd.es)."] },
      ],
    },
  },
  cookies: {
    es: {
      titulo: "Política de cookies",
      secciones: [
        { titulo: "Qué usamos", parrafos: ["Cookies técnicas, necesarias para que el sitio funcione: la sesión de tu cuenta si entras y la sesión anónima del asistente. No requieren consentimiento.", "Preferencias guardadas en tu navegador (tema claro u oscuro). No se envían a ningún servidor.", "Analítica: solo si la aceptas en el banner. Hasta entonces no se carga ningún script de analítica."] },
        { titulo: "Cómo cambiar tu elección", parrafos: ["Puedes cambiar o retirar tu consentimiento en cualquier momento desde el enlace «Cookies» del pie de página, y borrar las cookies desde la configuración de tu navegador."] },
      ],
    },
    en: {
      titulo: "Cookie policy",
      secciones: [
        { titulo: "What we use", parrafos: ["Technical cookies, needed for the website to work: your account session if you sign in, and the assistant's anonymous session. They do not require consent.", "Preferences stored in your browser (light or dark theme). They are not sent to any server.", "Analytics: only if you accept it in the banner. Until then, no analytics script is loaded."] },
        { titulo: "How to change your choice", parrafos: ["You can change or withdraw your consent at any time from the \"Cookies\" link in the footer, and delete cookies in your browser settings."] },
      ],
    },
  },
};
