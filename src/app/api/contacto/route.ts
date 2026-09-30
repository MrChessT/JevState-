import { NextResponse, type NextRequest } from "next/server";
import { BRAND } from "@/config/brand";
import { LimiteFrecuencia } from "@/asistente/limites";
import { enviarEmail } from "@/crm/email";
import { emailAgencia, emailCliente } from "@/crm/plantillas";
import { registrarContacto } from "@/crm/registro";
import { SolicitudContacto } from "@/crm/solicitud";
import { logger } from "@/observability/logger";
import { portal } from "@/portal/datos";
import { urlFicha } from "@/portal/urls";
import { getRuntime } from "@/server/runtime";

// Petición de contacto o de visita (formulario de la ficha y borradores del asistente).
// Nada se envía sin que la persona pulse «Enviar» con el consentimiento marcado.
let limite: LimiteFrecuencia | null = null;

function ipDe(request: NextRequest): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(request: NextRequest) {
  const { config } = getRuntime();
  // Límite por hora (por IP): un formulario de contacto no necesita más.
  limite ??= new LimiteFrecuencia(config.RATE_CONTACTO_PER_HOUR_IP * 1, 10_000);
  const ip = ipDe(request);
  if (!limite.permitir(`${ip}:${Math.floor(Date.now() / 3_600_000)}`)) return NextResponse.json({ error: "demasiadas_peticiones" }, { status: 429 });

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "peticion_no_valida" }, { status: 400 });
  }
  // Bots: el campo trampa relleno se acepta en silencio (no se guarda nada ni se avisa).
  if (typeof cuerpo === "object" && cuerpo && "web" in cuerpo && String((cuerpo as { web?: unknown }).web ?? "") !== "") return NextResponse.json({ ok: true });
  const r = SolicitudContacto.safeParse(cuerpo);
  if (!r.success) return NextResponse.json({ error: "datos_no_validos", campos: [...new Set(r.error.issues.map((i) => String(i.path[0] ?? "")))] }, { status: 422 });
  const s = r.data;

  let url: string | null = null;
  if (s.ref) {
    const [i] = await (await portal()).porRefs([s.ref]);
    if (!i) return NextResponse.json({ error: "inmueble_no_disponible" }, { status: 422 });
    url = `${BRAND.siteUrl}${urlFicha(s.locale, i)}`;
  }

  let registro;
  try {
    registro = await registrarContacto(s, { ip });
  } catch (err) {
    logger.error("contacto.error", { error: String(err).slice(0, 300) });
    return NextResponse.json({ error: "error_interno" }, { status: 500 });
  }
  logger.info("contacto.registrado", { id: registro.id, tipo: s.tipo, ref: s.ref ?? null, origen: s.origen, persistente: registro.persistente });

  // Emails: al buzón de la agencia y, si dejó email, la confirmación. Nunca bloquean la respuesta más de 8 s.
  const cfg = { apiKey: config.RESEND_API_KEY, de: config.EMAIL_FROM };
  const agencia = emailAgencia(s, url, registro.persistente);
  const envios: Array<Promise<unknown>> = [enviarEmail({ para: config.EMAIL_AGENCIA ?? BRAND.contact.email, ...agencia, responderA: s.email || undefined }, cfg)];
  if (s.email) envios.push(enviarEmail({ para: s.email, ...emailCliente(s, url), responderA: config.EMAIL_AGENCIA ?? BRAND.contact.email }, cfg));
  await Promise.allSettled(envios);

  return NextResponse.json({ ok: true, id: registro.id });
}
