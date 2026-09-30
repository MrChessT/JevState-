"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/server";

const Cambio = z.object({
  id: z.uuid(),
  estado: z.enum(["nuevo", "contactado", "cualificado", "visita", "oferta", "cerrado", "descartado"]),
  lang: z.enum(["es", "en"]),
});

/** Cambia el estado de un lead. La RLS decide: solo admin y agentes de su agencia pueden. */
export async function cambiarEstadoLead(formData: FormData): Promise<void> {
  const r = Cambio.safeParse({ id: formData.get("id"), estado: formData.get("estado"), lang: formData.get("lang") });
  if (!r.success) return;
  const supabase = await supabaseServidor();
  if (!supabase) return;
  await supabase.from("leads").update({ status: r.data.estado }).eq("id", r.data.id);
  revalidatePath(`/${r.data.lang}/admin/crm`);
}
