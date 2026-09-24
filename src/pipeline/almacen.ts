// Puerto de persistencia del pipeline. Implementaciones: memoria (tests, evaluación, desarrollo) y
// Supabase (RPC sde_contexto / sde_guardar con service_role, en una transacción).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoCanonico } from "@/sde/cascada/canonico";

export interface ContextoAlmacen {
  listingId?: string;
  contentHash?: string;
  manuales: Record<string, CampoCanonico>;
}

/** Lo que se guarda por inmueble (forma del parámetro de sde_guardar). */
export interface PayloadGuardado {
  agency_id: string;
  listing: Record<string, unknown> & { ref: string; source: string; source_id: string };
  private?: Record<string, unknown>;
  evidence: unknown[];
  fields: Array<Record<string, unknown> & { field_id: string }>;
  reviews: Array<Record<string, unknown> & { field_id: string }>;
  decisions: unknown[];
  translations: unknown[];
  media?: unknown[];
  poi_distances?: unknown[];
}

export interface ResultadoGuardado {
  listingId: string;
  canonicalVersion: number;
  cambio: boolean;
}

export interface AlmacenInmuebles {
  contexto(agencyId: string, source: string, sourceId: string): Promise<ContextoAlmacen>;
  guardar(p: PayloadGuardado): Promise<ResultadoGuardado>;
}

export class AlmacenMemoria implements AlmacenInmuebles {
  readonly guardados = new Map<string, { payload: PayloadGuardado; version: number; id: string }>();

  private clave(agency: string, source: string, sourceId: string) {
    return `${agency}:${source}:${sourceId}`;
  }

  async contexto(agencyId: string, source: string, sourceId: string): Promise<ContextoAlmacen> {
    const g = this.guardados.get(this.clave(agencyId, source, sourceId));
    if (!g) return { manuales: {} };
    const manuales = Object.fromEntries(
      g.payload.fields
        .filter((f) => f.method === "manual")
        .map((f) => [f.field_id, { value: f.value, confidence: f.confidence, status: f.status, evidenceIds: f.evidence_ids, method: "manual", catalogVersion: f.catalog_version } as CampoCanonico]),
    );
    return { listingId: g.id, contentHash: g.payload.listing.content_hash as string, manuales };
  }

  async guardar(p: PayloadGuardado): Promise<ResultadoGuardado> {
    const k = this.clave(p.agency_id, p.listing.source, p.listing.source_id);
    const prev = this.guardados.get(k);
    // Las correcciones manuales previas se conservan (igual que sde_guardar).
    const manuales = prev?.payload.fields.filter((f) => f.method === "manual") ?? [];
    const fields = [...p.fields.filter((f) => !manuales.some((m) => m.field_id === f.field_id)), ...manuales];
    const cambio = !prev || JSON.stringify(prev.payload.listing.canonical) !== JSON.stringify(p.listing.canonical);
    const version = (prev?.version ?? 0) + (cambio ? 1 : 0);
    const id = prev?.id ?? `mem-${this.guardados.size + 1}`;
    this.guardados.set(k, { payload: { ...p, fields }, version, id });
    return { listingId: id, canonicalVersion: version, cambio };
  }

  /** Solo tests: simula una corrección manual del equipo. */
  corregir(agency: string, source: string, sourceId: string, campo: string, valor: unknown) {
    const g = this.guardados.get(this.clave(agency, source, sourceId));
    if (!g) throw new Error("No existe");
    g.payload.fields = [...g.payload.fields.filter((f) => f.field_id !== campo), { field_id: campo, value: valor, confidence: 1, status: "confirmado", method: "manual", evidence_ids: [], catalog_version: "manual" }];
  }
}

export class AlmacenSupabase implements AlmacenInmuebles {
  constructor(private readonly db: SupabaseClient) {}

  async contexto(agencyId: string, source: string, sourceId: string): Promise<ContextoAlmacen> {
    const { data, error } = await this.db.rpc("sde_contexto", { p_agency: agencyId, p_source: source, p_source_id: sourceId });
    if (error) throw new Error(`sde_contexto: ${error.message}`);
    if (!data) return { manuales: {} };
    const d = data as { listing_id: string; content_hash: string | null; manuales: Record<string, CampoCanonico> };
    return { listingId: d.listing_id, contentHash: d.content_hash ?? undefined, manuales: d.manuales ?? {} };
  }

  async guardar(p: PayloadGuardado): Promise<ResultadoGuardado> {
    const { data, error } = await this.db.rpc("sde_guardar", { p });
    if (error) throw new Error(`sde_guardar: ${error.message}`);
    const d = data as { listing_id: string; canonical_version: number; cambio: boolean };
    return { listingId: d.listing_id, canonicalVersion: d.canonical_version, cambio: d.cambio };
  }
}
