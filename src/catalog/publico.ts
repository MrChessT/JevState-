// Vista ligera del catálogo para la interfaz (también en el navegador): solo etiqueta, tipo y
// unidad de cada campo. Sin validación ni dependencias de servidor: el catálogo completo
// (`@/catalog/index`) arrastra zod y criptografía, y pesaba ~870 KB en el cliente.
import compiled from "@catalog/compiled.json";

export interface CampoPublico {
  id: string;
  type: string;
  unit?: string | null;
  public: boolean;
  label: { es: string; en: string };
}

export const CAMPOS: ReadonlyArray<CampoPublico> = (compiled.fields as unknown as CampoPublico[]).map(({ id, type, unit, public: pub, label }) => ({ id, type, unit, public: pub, label }));

const POR_ID = new Map(CAMPOS.map((c) => [c.id, c]));
export const campo = (id: string): CampoPublico | undefined => POR_ID.get(id);
