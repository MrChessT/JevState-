import "server-only";
// Emails transaccionales con Resend (API HTTP, sin SDK). Sin RESEND_API_KEY no se envía nada:
// se deja constancia en el log y el contacto sigue guardado. Un fallo de email nunca pierde el lead.
import { logger } from "@/observability/logger";

export interface Email {
  para: string;
  asunto: string;
  texto: string;
  responderA?: string;
}

export async function enviarEmail(e: Email, cfg: { apiKey?: string; de?: string }): Promise<"enviado" | "omitido" | "error"> {
  if (!cfg.apiKey || !cfg.de) {
    logger.info("email.omitido", { asunto: e.asunto, motivo: "sin RESEND_API_KEY o EMAIL_FROM" });
    return "omitido";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: cfg.de, to: [e.para], subject: e.asunto, text: e.texto, ...(e.responderA ? { reply_to: e.responderA } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.warn("email.error", { estado: res.status, asunto: e.asunto });
      return "error";
    }
    return "enviado";
  } catch (err) {
    logger.warn("email.error", { error: String(err).slice(0, 200), asunto: e.asunto });
    return "error";
  }
}
