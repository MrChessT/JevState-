// El state de Jev nunca lleva teléfono ni email (sección 9). Se sustituyen antes de enviar.
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Teléfonos españoles e internacionales: 9+ dígitos con separadores opcionales.
const TELEFONO = /(?:\+|00)?\d{2}[\s.-]?\d{3}[\s.-]?\d{2,3}[\s.-]?\d{2,3}(?:[\s.-]?\d{2})?|\b[6-9]\d{2}[\s.-]?\d{2,3}[\s.-]?\d{2,3}[\s.-]?\d{0,3}\b/g;

export function sinDatosPersonales(texto: string): string {
  return texto.replace(EMAIL, "[email]").replace(TELEFONO, (m) => (m.replace(/\D/g, "").length >= 9 ? "[teléfono]" : m));
}
