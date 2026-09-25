// Configuración de marca: ÚNICO sitio donde aparece el nombre comercial. Un test
// (brand.test.ts) falla si el nombre o el marcador aparecen escritos en cualquier otro archivo
// de src/. Para cambiar de agencia se edita este archivo y nada más.

export interface Brand {
  /** Nombre comercial. */
  name: string;
  /** Nombre legal de la sociedad (aviso legal). */
  legalName: string;
  /** CIF/NIF de la sociedad (aviso legal). Vacío hasta que se configure. */
  taxId: string;
  /** Número de registro de agentes inmobiliarios si aplica en la comunidad (vacío si no). */
  agentRegistry: string;
  /** Color principal en hexadecimal. El sistema de diseño deriva la escala completa con color-mix. */
  primaryColor: string;
  /** Color de acento (CTA secundarios, enlaces). */
  accentColor: string;
  contact: { email: string; phone: string; address: string; city: string };
  /** Dominio canónico sin barra final (SEO, sitemap, Open Graph). */
  siteUrl: string;
  social: Partial<Record<"instagram" | "facebook" | "linkedin" | "youtube", string>>;
}

export const BRAND: Brand = {
  name: "{{NOMBRE_INMOBILIARIA}}",
  legalName: "{{NOMBRE_INMOBILIARIA}} S.L.",
  taxId: "",
  agentRegistry: "",
  primaryColor: "#1f4e5f",
  accentColor: "#c2410c",
  contact: {
    email: "hola@example.com",
    phone: "+34 968 000 000",
    address: "Calle de ejemplo, 1",
    city: "Murcia",
  },
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "http://localhost:3000",
  social: {},
};

/** true mientras el nombre comercial no esté decidido (sigue el marcador). */
export const MARCA_PROVISIONAL = BRAND.name.includes("{{");

/** Nombre que se muestra: el comercial o, mientras no exista, uno descriptivo. */
export const NOMBRE_VISIBLE = MARCA_PROVISIONAL ? "Inmobiliaria Región de Murcia" : BRAND.name;

