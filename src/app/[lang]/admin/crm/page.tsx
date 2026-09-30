import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, LOCALE_TAGS, ruta } from "@/i18n/config";
import { diccionario, t } from "@/i18n/diccionario";
import { sesion, supabaseServidor } from "@/lib/supabase/server";
import { urlFicha } from "@/portal/urls";
import { Aviso } from "@/ui/componentes";
import { cambiarEstadoLead } from "./acciones";
import s from "./crm.module.css";

const ESTADOS = ["nuevo", "contactado", "cualificado", "visita", "oferta", "cerrado", "descartado"] as const;
type EstadoLead = (typeof ESTADOS)[number];

interface FilaBandeja {
  id: string;
  created_at: string;
  status: EstadoLead;
  kind: string;
  origin: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  asked_field: string | null;
  listing_ref: string | null;
  listing_slug: string | null;
  listing_operation: string | null;
  listing_zona_path: string | null;
  visita_inicio: string | null;
  visita_estado: string | null;
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await diccionario(isLocale(lang) ? lang : "es");
  return { title: d.admin.crm.titulo, robots: { index: false, follow: false } };
}

export default async function Crm({ params, searchParams }: PageProps<"/[lang]/admin/crm">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const actual = await sesion();
  if (!actual) redirect(ruta(lang, "cuenta", "entrar"));
  const d = await diccionario(lang);
  const c = d.admin.crm;
  const membresia = actual.membresias[0];
  // El editor no ve datos personales (sección 2.3).
  if (!membresia || membresia.role === "editor") {
    return (
      <div className="contenedor texto-largo" style={{ paddingBlock: "var(--e-7)" }}>
        <h1>{c.titulo}</h1>
        <Aviso tipo="error" role="alert">
          <p>{d.admin.sinPermiso}</p>
        </Aviso>
      </div>
    );
  }
  const q = await searchParams;
  const filtro = typeof q.estado === "string" && (ESTADOS as readonly string[]).includes(q.estado) ? (q.estado as EstadoLead) : null;
  const supabase = (await supabaseServidor())!;
  let consulta = supabase.from("crm_bandeja").select("*").order("created_at", { ascending: false }).limit(200);
  if (filtro) consulta = consulta.eq("status", filtro);
  const { data, error } = await consulta;
  const filas = (data ?? []) as FilaBandeja[];
  const fecha = new Intl.DateTimeFormat(LOCALE_TAGS[lang].intl, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });
  const nuevos = filas.filter((f) => f.status === "nuevo").length;
  const visitas = filas.filter((f) => f.visita_estado === "solicitada" || f.visita_estado === "confirmada").length;

  return (
    <div className="contenedor" style={{ paddingBlock: "var(--e-7)", display: "grid", gap: "var(--e-5)" }}>
      <header className={s.cabecera}>
        <Link href={ruta(lang, "admin")}>← {c.volver}</Link>
        <h1>{c.titulo}</h1>
        <p className={s.suave}>{c.descripcion}</p>
        {!error && <p className={s.resumen}>{t(c.resumen, { nuevos: String(nuevos), visitas: String(visitas), total: String(filas.length) })}</p>}
      </header>
      <nav aria-label={c.filtro} className={s.filtros}>
        <Link href={ruta(lang, "admin", "crm")} aria-current={!filtro ? "page" : undefined}>
          {c.todos}
        </Link>
        {ESTADOS.map((e) => (
          <Link key={e} href={`${ruta(lang, "admin", "crm")}?estado=${e}`} aria-current={filtro === e ? "page" : undefined}>
            {c.estados[e]}
          </Link>
        ))}
      </nav>
      {error ? (
        <Aviso tipo="error" role="alert">
          <p>{c.sinSupabase}</p>
        </Aviso>
      ) : filas.length === 0 ? (
        <p className={s.suave}>{c.vacio}</p>
      ) : (
        <div className={s.desplazable}>
          <table className={s.tabla}>
            <thead>
              <tr>
                <th scope="col">{c.fecha}</th>
                <th scope="col">{c.persona}</th>
                <th scope="col">{c.inmueble}</th>
                <th scope="col">{c.tipo}</th>
                <th scope="col">{c.visita}</th>
                <th scope="col">{c.estado}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} data-estado={f.status}>
                  <td>
                    <time dateTime={f.created_at}>{fecha.format(new Date(f.created_at))}</time>
                    <div className={s.suave}>{c.origenes[f.origin as keyof typeof c.origenes] ?? f.origin}</div>
                  </td>
                  <td>
                    <strong>{f.name ?? "—"}</strong>
                    {f.email && (
                      <div>
                        <a href={`mailto:${f.email}`}>{f.email}</a>
                      </div>
                    )}
                    {f.phone && (
                      <div>
                        <a href={`tel:${f.phone.replace(/\s/g, "")}`}>{f.phone}</a>
                      </div>
                    )}
                    {f.message && <p className={s.mensaje}>{f.message}</p>}
                  </td>
                  <td>{f.listing_ref && f.listing_slug && f.listing_operation && f.listing_zona_path ? <Link href={urlFicha(lang, { operacion: f.listing_operation, zonaPath: f.listing_zona_path, slug: f.listing_slug })}>{f.listing_ref}</Link> : (f.listing_ref ?? "—")}</td>
                  <td>
                    {c.tipos[f.kind as keyof typeof c.tipos] ?? f.kind}
                    {f.asked_field && <div className={s.suave}>{t(c.preguntaPor, { campo: f.asked_field.replace(/,/g, ", ").replace(/_/g, " ") })}</div>}
                  </td>
                  <td>
                    {f.visita_inicio ? (
                      <>
                        <time dateTime={f.visita_inicio}>{fecha.format(new Date(f.visita_inicio))}</time>
                        <div className={s.suave}>{c.estadosVisita[f.visita_estado as keyof typeof c.estadosVisita] ?? f.visita_estado}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <form action={cambiarEstadoLead} className={s.estadoForm}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="lang" value={lang} />
                      <label className="visually-hidden" htmlFor={`estado-${f.id}`}>
                        {c.estado}
                      </label>
                      <select id={`estado-${f.id}`} name="estado" defaultValue={f.status}>
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>
                            {c.estados[e]}
                          </option>
                        ))}
                      </select>
                      <button type="submit">{c.guardar}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
