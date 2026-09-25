// Respuestas del asistente con plantillas (sección 4.6): el texto lo compone el código a partir de
// datos ya decididos. Nada de lo que se dice sale de un modelo que escribe libremente, así que no
// puede inventar un precio, un metro ni una característica.
import { BRAND } from "@/config/brand";
import type { Locale } from "@/i18n/config";
import type { Relajacion } from "./buscar";

type Vars = Record<string, string | number>;

const ES = {
  saludo: "Hola, soy el asistente de {marca}. Cuéntame qué buscas con tus palabras: zona, presupuesto, cuántas habitaciones, si quieres terraza o garaje… y te enseño lo que encaja y por qué.",
  gracias: "¡A ti! Si quieres afinar la búsqueda, dime qué cambiarías.",
  sobreAsistente: "Busco entre los inmuebles publicados por {marca} en la Región de Murcia. Cada dato que te enseño viene de la ficha, con su estado (confirmado, probable o no consta). Si algo no consta, no me lo invento: se lo preguntamos al agente.",
  pedirCriterios: "Para buscar necesito al menos una zona o un presupuesto. Por ejemplo: «piso en Murcia hasta 200.000 € con terraza».",
  resultados: "He encontrado {n} {inmuebles} que encajan. Te enseño {m} ordenados por lo que me has pedido.",
  resultadosUno: "He encontrado 1 inmueble que encaja.",
  sinResultados: "No he encontrado nada con esos criterios, ni ampliando la búsqueda. Prueba a quitar algún requisito o a subir el presupuesto.",
  relajado: "Con tus criterios exactos no había nada, así que he {cambios}. Así salen {n}.",
  relajacion: {
    colindantes: "ampliado a las zonas de alrededor",
    tolerancia_10: "admitido hasta un 10 % por encima de tu presupuesto",
    requisitos_deseables: "tratado los imprescindibles como deseables",
    menos_habitaciones: "bajado una habitación",
  } satisfies Record<Relajacion, string>,
  ampliadas: "No estaba seguro de qué zona decías, así que he buscado también en {zonas}. Si no es lo que querías, quítala de los filtros.",
  presupuestoDudoso: "He entendido que tu presupuesto es de {precio}; si no es así, corrígelo en los filtros.",
  degradado: "Ahora mismo estoy en modo básico: busco por palabras clave y puede que se me escapen matices. Los filtros funcionan con normalidad.",
  aclararZona: "¿A qué zona te refieres con «{literal}»?",
  aclararIntencion: "No estoy seguro de qué quieres hacer. ¿Es alguna de estas?",
  aclararInmueble: "¿De qué inmueble me hablas?",
  detalleSin: "Dime de qué inmueble quieres saber algo: puedes darme su referencia o abrir su ficha y preguntarme desde allí.",
  detalleValor: "{campo} de {ref}: {valor} ({estado}).",
  detalleNoConsta: "En la ficha de {ref} no consta {campo}. No me lo invento: si quieres, se lo preguntamos al agente desde la ficha.",
  detalleGeneral: "{ref}: {resumen}. Pregúntame por cualquier dato concreto (gastos de comunidad, planta, ascensor, orientación…).",
  detalleDistancia: "Desde {ref}, lo más cercano de {categoria} está a {metros} (unos {minutos} min andando).",
  estado: { confirmado: "confirmado", probable: "probable: deducido de la descripción", revisar: "pendiente de revisar", no_consta: "no consta" },
  comparar: "Aquí tienes la comparación con los datos de cada ficha. Lo que no consta aparece como «—».",
  compararFaltan: "Para comparar necesito al menos dos inmuebles. Dime sus referencias o añádelos al comparador desde las tarjetas.",
  feedbackGustado: "¡Me alegro! Lo tienes en la lista; puedes guardarlo en favoritos o preguntarme lo que quieras de él.",
  feedbackAjuste: "Entendido, lo quito y {ajuste}.",
  feedbackAjustes: { luz: "priorizo los más luminosos", precio: "priorizo los de mejor precio", tamano: "priorizo los más amplios", estado: "priorizo los que están en mejor estado", zona: "lo tengo en cuenta", distribucion: "lo tengo en cuenta", otro: "te enseño otras opciones", gustado: "" },
  noDisponible: {
    pedir_visita: "Las visitas por el asistente llegan en la próxima fase. Mientras tanto, desde la ficha del inmueble puedes contactar con el agente.",
    contactar_agente: "El contacto por el asistente llega en la próxima fase. Mientras tanto, puedes escribir a {email}.",
    crear_alerta: "Las alertas llegan en la próxima fase. De momento puedes guardar esta búsqueda en favoritos.",
    valorar_mi_vivienda: "La valoración de tu vivienda llega en una próxima fase. Si quieres vender o alquilar, escríbenos a {email}.",
  },
  inyeccion: "No puedo hacer eso. Solo te ayudo a buscar y conocer los inmuebles publicados, con los datos públicos de cada ficha.",
  fueraDeAmbito: "Solo puedo ayudarte con inmuebles de {marca} en la Región de Murcia: buscar, preguntar por una ficha o comparar.",
  error: "Algo ha fallado al preparar la respuesta. Vuelve a intentarlo en unos segundos.",
  // «Por qué» de cada tarjeta
  porque: {
    bajoMediana: "{pct} % por debajo del €/m² medio de {zona}",
    sobreMediana: "{pct} % por encima del €/m² medio de {zona}",
    enMediana: "En el €/m² medio de {zona}",
    tiene: "{rasgo} · dato confirmado",
    probable: "{rasgo} · probable, según la descripción",
    sobrePresupuesto: "Supera tu presupuesto un {pct} %",
    zonaAmpliada: "En zona cercana: {zona}",
    encajeAlto: "Encaja con lo que describes",
    encajeBajo: "Encaja solo en parte con lo que describes",
    nuevo: "Publicado hace {dias} días",
  },
  chips: {
    venta: "Comprar", alquiler: "Alquilar", hasta: "Hasta {precio}", desde: "Desde {precio}", hab: "{n}+ hab.",
    imprescindible: "{rasgo}", deseable: "{rasgo} (deseable)", rechazo: "Sin {rasgo}", sinBajos: "Sin bajos", cerca: "Cerca de {sitio}",
    prioridad: "Prioridad: {p}", perfil: "{p}",
  },
  prioridades: { precio: "precio", espacio: "espacio", ubicacion: "ubicación", estado: "estado", rentabilidad: "rentabilidad", tranquilidad: "tranquilidad" } as Record<string, string>,
  perfiles: { vivienda_habitual_con_hijos: "Vivienda familiar", vivienda_habitual: "Vivienda habitual", inversion: "Inversión", segunda_residencia: "Segunda residencia" } as Record<string, string>,
  intenciones: { buscar: "Buscar inmuebles", refinar: "Cambiar la búsqueda", detalle_inmueble: "Preguntar por un inmueble", comparar: "Comparar inmuebles", valorar_mi_vivienda: "Valorar mi vivienda", pedir_visita: "Pedir una visita", contactar_agente: "Hablar con un agente", crear_alerta: "Crear una alerta", feedback_resultado: "Opinar sobre un resultado", conversar: "Otra cosa" } as Record<string, string>,
  inmuebles: ["inmueble", "inmuebles"],
};

const EN: typeof ES = {
  saludo: "Hi, I'm the {marca} assistant. Tell me what you're looking for in your own words: area, budget, bedrooms, whether you want a terrace or a garage… and I'll show you what fits and why.",
  gracias: "You're welcome! If you want to fine-tune the search, tell me what you'd change.",
  sobreAsistente: "I search the properties listed by {marca} in the Region of Murcia. Every detail I show comes from the listing, with its status (confirmed, likely or not stated). If something isn't stated, I don't make it up: we ask the agent.",
  pedirCriterios: "To search I need at least an area or a budget. For example: \"flat in Murcia up to €200,000 with a terrace\".",
  resultados: "I found {n} {inmuebles} that fit. Here are {m}, ranked by what you asked for.",
  resultadosUno: "I found 1 property that fits.",
  sinResultados: "I couldn't find anything with those criteria, even after widening the search. Try removing a requirement or raising the budget.",
  relajado: "Nothing matched your exact criteria, so I {cambios}. That gives {n}.",
  relajacion: {
    colindantes: "widened the search to nearby areas",
    tolerancia_10: "allowed up to 10% above your budget",
    requisitos_deseables: "treated the must-haves as nice-to-haves",
    menos_habitaciones: "lowered the bedrooms by one",
  },
  ampliadas: "I wasn't sure which area you meant, so I also searched {zonas}. If that's not what you wanted, remove it from the filters.",
  presupuestoDudoso: "I understood your budget as {precio}; if that's wrong, change it in the filters.",
  degradado: "I'm in basic mode right now: I search by keywords and may miss some nuances. The filters work as usual.",
  aclararZona: "Which area do you mean by \"{literal}\"?",
  aclararIntencion: "I'm not sure what you'd like to do. Is it one of these?",
  aclararInmueble: "Which property do you mean?",
  detalleSin: "Tell me which property you want to know about: give me its reference, or open its listing and ask me from there.",
  detalleValor: "{campo} for {ref}: {valor} ({estado}).",
  detalleNoConsta: "The listing for {ref} doesn't state {campo}. I won't guess: if you like, we can ask the agent from the listing.",
  detalleGeneral: "{ref}: {resumen}. Ask me about any specific detail (community fees, floor, lift, orientation…).",
  detalleDistancia: "From {ref}, the nearest {categoria} is {metros} away (about {minutos} min on foot).",
  estado: { confirmado: "confirmed", probable: "likely: inferred from the description", revisar: "pending review", no_consta: "not stated" },
  comparar: "Here's the comparison with the data from each listing. Anything not stated shows as \"—\".",
  compararFaltan: "To compare I need at least two properties. Give me their references or add them to the comparison from the cards.",
  feedbackGustado: "Glad you like it! It's in your list; you can save it to favourites or ask me anything about it.",
  feedbackAjuste: "Got it, I've removed it and {ajuste}.",
  feedbackAjustes: { luz: "I'm prioritising brighter ones", precio: "I'm prioritising better-priced ones", tamano: "I'm prioritising roomier ones", estado: "I'm prioritising ones in better condition", zona: "I'll take that into account", distribucion: "I'll take that into account", otro: "here are other options", gustado: "" },
  noDisponible: {
    pedir_visita: "Booking viewings through the assistant arrives in the next phase. Meanwhile, you can contact the agent from the listing.",
    contactar_agente: "Contact through the assistant arrives in the next phase. Meanwhile, you can write to {email}.",
    crear_alerta: "Alerts arrive in the next phase. For now you can save properties to your favourites.",
    valorar_mi_vivienda: "Home valuations arrive in a later phase. If you want to sell or let, write to {email}.",
  },
  inyeccion: "I can't do that. I only help you search and learn about the listed properties, using each listing's public data.",
  fueraDeAmbito: "I can only help with {marca} properties in the Region of Murcia: searching, asking about a listing or comparing.",
  error: "Something went wrong while preparing the answer. Please try again in a few seconds.",
  porque: {
    bajoMediana: "{pct}% below the average €/m² in {zona}",
    sobreMediana: "{pct}% above the average €/m² in {zona}",
    enMediana: "At the average €/m² in {zona}",
    tiene: "{rasgo} · confirmed",
    probable: "{rasgo} · likely, from the description",
    sobrePresupuesto: "{pct}% over your budget",
    zonaAmpliada: "In a nearby area: {zona}",
    encajeAlto: "Fits what you describe",
    encajeBajo: "Only partly fits what you describe",
    nuevo: "Listed {dias} days ago",
  },
  chips: {
    venta: "Buy", alquiler: "Rent", hasta: "Up to {precio}", desde: "From {precio}", hab: "{n}+ bed",
    imprescindible: "{rasgo}", deseable: "{rasgo} (nice to have)", rechazo: "No {rasgo}", sinBajos: "No ground floors", cerca: "Near {sitio}",
    prioridad: "Priority: {p}", perfil: "{p}",
  },
  prioridades: { precio: "price", espacio: "space", ubicacion: "location", estado: "condition", rentabilidad: "yield", tranquilidad: "quiet" },
  perfiles: { vivienda_habitual_con_hijos: "Family home", vivienda_habitual: "Main home", inversion: "Investment", segunda_residencia: "Second home" },
  intenciones: { buscar: "Search properties", refinar: "Change the search", detalle_inmueble: "Ask about a property", comparar: "Compare properties", valorar_mi_vivienda: "Value my home", pedir_visita: "Book a viewing", contactar_agente: "Talk to an agent", crear_alerta: "Create an alert", feedback_resultado: "Give feedback on a result", conversar: "Something else" },
  inmuebles: ["property", "properties"],
};

export const PLANTILLAS: Record<Locale, typeof ES> = { es: ES, en: EN };
export type Plantillas = typeof ES;

/** Sustituye {variables}; {marca} y {email} siempre están disponibles. */
export function rellenar(texto: string, vars: Vars = {}): string {
  const all: Vars = { marca: BRAND.name, email: BRAND.contact.email, ...vars };
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in all ? String(all[k]) : m));
}
