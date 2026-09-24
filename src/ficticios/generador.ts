// Generador determinista de inmuebles FICTICIOS para desarrollo y evaluación (sección 11).
// Cada inmueble lleva ref «FIC-», la marca `ficticio` y una nota en la descripción: nunca se mezclan
// con datos reales. Además del feed y las páginas, produce la VERDAD de referencia: lo que un humano
// cuidadoso anotaría leyendo todas las fuentes (null = no consta en ninguna).
import { ZONAS, type Zona } from "@/zonas/buscar";

export type ValorVerdad = string | number | boolean | null;

export interface InmuebleFicticio {
  ref: string;
  escenarios: string[];
  /** Kyero XML de este inmueble (fragmento <property>). */
  xml: string;
  /** Página HTML del anuncio (solo en una parte). */
  html?: string;
  verdad: Record<string, ValorVerdad>;
}

// PRNG determinista (mulberry32).
export function prng(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    entre: (min: number, max: number) => Math.floor(min + r() * (max - min + 1)),
    si: (p: number) => r() < p,
    uno: <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!,
    peso: <T extends string>(opciones: Record<T, number>): T => {
      const total = Object.values<number>(opciones).reduce((s, x) => s + x, 0);
      let x = r() * total;
      for (const [k, w] of Object.entries(opciones) as Array<[T, number]>) {
        x -= w;
        if (x <= 0) return k;
      }
      return Object.keys(opciones)[0] as T;
    },
  };
}

// €/m² orientativos por municipio (ficticios, del orden del mercado).
const EUR_M2: Record<string, number> = {
  murcia: 1500, cartagena: 1350, "san-javier": 2100, "san-pedro-del-pinatar": 1750, "los-alcazares": 1800, "torre-pacheco": 1100,
  mazarron: 1450, aguilas: 1550, lorca: 950, "molina-de-segura": 1150, "la-union": 900, alcantarilla: 1050,
};
const COSTA_PREMIUM: Record<string, number> = { "cartagena/la-manga": 1.6, "san-javier/la-manga": 1.6, "cartagena/cabo-de-palos": 1.5, "san-javier/santiago-de-la-ribera": 1.2, "murcia/centro": 1.35 };

const fmt = (n: number) => n.toLocaleString("es-ES").replace(/ /g, ".");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PALABRAS: Record<number, string> = { 1: "un", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco" };
function enPalabrasMiles(n: number): string {
  // Solo para importes redondos de miles (100.000-990.000): «doscientos cincuenta mil».
  const miles = Math.round(n / 1000);
  const c = Math.floor(miles / 100);
  const resto = miles % 100;
  const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"][c]!;
  const decenas = ["", "diez", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"][Math.floor(resto / 10)]!;
  const txt = [c === 1 && resto === 0 ? "cien" : centenas, resto % 10 === 0 ? decenas : `${decenas} y ${PALABRAS[resto % 10] ?? ""}`].filter(Boolean).join(" ");
  return `${txt} mil`;
}

// Solo barrios, o municipios sin barrios: así la zona verdadera es inequívoca (un punto junto al
// centroide de un municipio con barrios caería en su barrio «centro»).
const CON_BARRIOS = new Set(ZONAS.filter((z) => z.nivel === "barrio").map((z) => z.municipio));
const ZONAS_GEN: Array<{ z: Zona; w: number }> = ZONAS.filter((z) => EUR_M2[z.municipio] !== undefined && (z.nivel === "barrio" || !CON_BARRIOS.has(z.municipio))).map((z) => ({ z, w: z.nivel === "barrio" ? 3 : 2 }));

export function generarInmueble(n: number, semilla = 20260924): InmuebleFicticio {
  const g = prng(semilla + n * 7919);
  const ref = `FIC-${String(n).padStart(4, "0")}`;
  const esc_: string[] = [];
  const v: Record<string, ValorVerdad> = {};

  // Zona y punto (cerca del centroide para que la verdad sea inequívoca).
  const total = ZONAS_GEN.reduce((s, x) => s + x.w, 0);
  let x = g.r() * total;
  const zona = ZONAS_GEN.find((q) => (x -= q.w) <= 0)!.z;
  const lat = +(zona.lat + (g.r() - 0.5) * 0.003).toFixed(6);
  const lon = +(zona.lon + (g.r() - 0.5) * 0.003).toFixed(6);
  const municipio = ZONAS.find((q) => q.path === zona.municipio)!;
  v.zona = zona.path;

  const operacion = g.peso({ venta: 74, alquiler: 24, alquiler_vacacional: 2 });
  const costa = zona.costa || municipio.costa;
  const tipo = g.peso(costa ? { piso: 40, atico: 10, adosado: 20, chalet: 10, duplex: 8, estudio: 6, casa: 3, local: 2, terreno: 1 } : { piso: 50, atico: 6, adosado: 10, chalet: 8, duplex: 5, estudio: 5, casa: 10, local: 4, terreno: 2 });
  v.operacion = operacion;
  v.tipo = tipo;

  const m2 = tipo === "estudio" ? g.entre(30, 45) : tipo === "terreno" ? g.entre(300, 3000) : tipo === "local" ? g.entre(50, 250) : tipo === "chalet" ? g.entre(140, 320) : tipo === "casa" ? g.entre(90, 220) : g.entre(55, 140);
  const habitaciones = tipo === "estudio" ? 0 : tipo === "local" || tipo === "terreno" ? null : Math.max(1, Math.min(6, Math.round(m2 / 32)));
  const banos = habitaciones === null ? null : Math.max(1, Math.min(4, Math.round((habitaciones + 1) / 2)));
  v.superficie_construida = tipo === "terreno" ? null : String(m2);
  v.superficie_parcela = tipo === "terreno" ? String(m2) : tipo === "chalet" ? String(g.entre(300, 1200)) : null;
  v.habitaciones = habitaciones;
  v.banos = banos;

  const enEdificio = ["piso", "atico", "duplex", "estudio"].includes(tipo);
  const planta = enEdificio ? (tipo === "atico" ? g.entre(4, 9) : g.entre(0, 7)) : null;
  v.planta = planta;
  v.planta_tipo = !enEdificio ? null : tipo === "atico" ? "atico" : planta === 0 ? "bajo" : "intermedia";

  const estado = g.peso({ a_reformar: 10, para_actualizar: 15, buen_estado: 45, reformado: 22, a_estrenar: 8 });
  const factorEstado = { a_reformar: 0.7, para_actualizar: 0.85, buen_estado: 1, reformado: 1.12, a_estrenar: 1.25 }[estado];
  const base = (EUR_M2[zona.municipio] ?? 1200) * (COSTA_PREMIUM[zona.path] ?? 1);
  const precioVenta = Math.round((base * (tipo === "terreno" ? 0.08 : 1) * m2 * factorEstado * (0.9 + g.r() * 0.2)) / 1000) * 1000;
  const alquiler = Math.round((base / 180) * Math.min(m2, 160) * (0.9 + g.r() * 0.2) / 10) * 10;
  const precio = operacion === "venta" ? precioVenta : operacion === "alquiler" ? alquiler : Math.round(alquiler * 0.6 / 10) * 10;
  v.precio = String(precio);

  // Características.
  const f = {
    terraza: tipo === "atico" || g.si(enEdificio ? 0.45 : 0.3),
    balcon: enEdificio && g.si(0.3),
    ascensor: enEdificio && (planta ?? 0) >= 1 ? g.si(0.75) : false,
    garaje: g.peso(tipo === "local" || tipo === "terreno" ? { incluido: 0, opcional: 0, no_tiene: 1 } : { incluido: 30, opcional: 10, no_tiene: 60 }),
    trastero: enEdificio && g.si(0.3),
    piscina: g.peso(costa ? { comunitaria: 40, privada: tipo === "chalet" ? 40 : 5, no_tiene: 55 } : { comunitaria: 15, privada: tipo === "chalet" ? 35 : 3, no_tiene: 82 }),
    aire: g.si(0.6),
    calefaccion: g.si(0.35),
    amueblado: operacion !== "venta" ? g.si(0.7) : g.si(0.1),
  };

  // Escenarios de ambigüedad (sección 11).
  const S = {
    rebaja: operacion === "venta" && g.si(0.12),
    rebajaFeedViejo: false,
    jsonldViejo: false,
    terrazaSoloTexto: f.terraza && g.si(0.35),
    reformar: estado === "a_reformar",
    garajeOpcional: f.garaje === "opcional",
    comunidadTrimestral: enEdificio && g.si(0.25),
    sinAscensorExplicito: enEdificio && !f.ascensor && (planta ?? 0) >= 1 && g.si(0.6),
    alquilado: operacion === "venta" && enEdificio && g.si(0.07),
    vpo: operacion === "venta" && enEdificio && g.si(0.03),
    okupado: operacion === "venta" && g.si(0.012),
    nuda: operacion === "venta" && g.si(0.012),
    subasta: operacion === "venta" && g.si(0.012),
    utilYConstruida: tipo !== "terreno" && g.si(0.3),
    precioEnPalabras: operacion === "venta" && precio >= 100_000 && precio < 1_000_000 && g.si(0.05),
    certificadoTramite: g.si(0.12),
    negociable: operacion === "venta" && g.si(0.12),
    orientacion: g.si(0.25) ? g.uno(["sur", "norte", "este", "oeste", "sureste", "suroeste"] as const) : null,
    luminoso: g.peso({ ninguno: 55, luminoso: 30, muy_luminoso: 15 }),
    tranquilo: g.si(0.3),
    vistasMar: costa && g.si(0.3),
    conHtml: g.si(0.3),
  };
  let precioAnterior: number | null = null;
  if (S.rebaja) {
    precioAnterior = Math.round((precio * (1.05 + g.r() * 0.1)) / 1000) * 1000;
    S.rebajaFeedViejo = g.si(0.4);
    esc_.push(S.rebajaFeedViejo ? "precio_rebajado_feed_desactualizado" : "precio_rebajado");
  }
  if (S.conHtml && !S.rebaja && operacion === "venta" && g.si(0.3)) {
    S.jsonldViejo = true;
    precioAnterior = null;
    esc_.push("jsonld_desactualizado");
  }
  v.precio_anterior = precioAnterior === null ? null : String(precioAnterior);

  const comunidad = enEdificio || f.piscina === "comunitaria" ? g.entre(3, 12) * 10 : null;
  const ibi = operacion === "venta" && g.si(0.4) ? g.entre(15, 90) * 10 : null;
  const certificado = S.certificadoTramite ? "en_tramite" : g.si(0.6) ? g.uno(["a", "b", "c", "d", "e", "e", "f", "g"] as const) : null;

  // --- Texto de la descripción (en español; algunas con inglés también). ---
  const frases: string[] = [];
  const nombreTipo = { piso: "Piso", atico: "Ático", duplex: "Dúplex", casa: "Casa", chalet: "Chalet", adosado: "Adosado", estudio: "Estudio", local: "Local comercial", terreno: "Terreno", oficina: "Oficina", garaje: "Plaza de garaje" }[tipo];
  const opTxt = operacion === "venta" ? "en venta" : operacion === "alquiler" ? "en alquiler" : "para alquiler vacacional";
  frases.push(`${nombreTipo} ${opTxt} en ${zona.nombre}${zona.nivel === "barrio" ? `, ${zona.nombreMunicipio}` : ""}.`);
  if (tipo !== "terreno") {
    if (S.utilYConstruida) frases.push(`Cuenta con ${m2} m² construidos y ${Math.round(m2 * 0.85)} m² útiles.`);
    else frases.push(`Superficie de ${m2} m².`);
  } else frases.push(`Parcela de ${m2} m².`);
  if (S.utilYConstruida) v.superficie_util = String(Math.round(m2 * 0.85));
  else v.superficie_util = null;
  if (habitaciones !== null && habitaciones > 0) frases.push(`Distribuido en ${g.si(0.3) ? (PALABRAS[habitaciones] ?? habitaciones) : habitaciones} ${g.si(0.5) ? "dormitorios" : "habitaciones"} y ${banos} ${banos === 1 ? "baño" : "baños"}.`);
  if (enEdificio && planta !== null) {
    if (tipo === "atico") frases.push(`Ático en ${planta}ª planta${S.sinAscensorExplicito ? " sin ascensor" : ""}.`);
    else if (planta === 0) frases.push("Se trata de un bajo con acceso directo.");
    else frases.push(`Situado en ${planta}ª planta${f.ascensor ? " con ascensor" : S.sinAscensorExplicito ? " sin ascensor" : ""}.`);
  }
  if (f.ascensor && tipo === "atico") frases.push("El edificio dispone de ascensor.");
  if (f.terraza) frases.push(`Dispone de terraza de ${g.entre(8, 40)} m².`);
  if (S.reformar) frases.push("Vivienda para reformar, ideal para darle tu estilo.");
  else if (estado === "reformado") frases.push("Totalmente reformado.");
  else if (estado === "a_estrenar") frases.push("Vivienda a estrenar.");
  if (S.luminoso === "luminoso") frases.push("Es un inmueble luminoso.");
  if (S.luminoso === "muy_luminoso") frases.push("Muy luminoso, con mucha luz natural todo el día.");
  if (S.orientacion) frases.push(`Orientación ${S.orientacion}.`);
  if (S.tranquilo) frases.push("Zona muy tranquila.");
  if (S.vistasMar) frases.push("Con vistas al mar.");
  if (f.garaje === "incluido") frases.push("Plaza de garaje incluida en el precio.");
  if (S.garajeOpcional) frases.push(`Plaza de garaje opcional por ${fmt(g.entre(8, 20) * 1000)} €.`);
  if (f.trastero) frases.push("Incluye trastero.");
  if (f.piscina === "comunitaria") frases.push("Urbanización con piscina comunitaria.");
  if (f.piscina === "privada") frases.push("Con piscina privada.");
  if (f.aire) frases.push("Aire acondicionado por conductos.");
  if (f.calefaccion) frases.push("Calefacción individual.");
  if (f.amueblado && operacion !== "venta") frases.push("Se alquila amueblado.");
  if (S.alquilado) frases.push("Ideal inversores: se vende alquilado con inquilino.");
  if (S.vpo) frases.push("Vivienda de protección oficial (VPO).");
  if (S.okupado) frases.push("Inmueble okupado, se vende sin posesión.");
  if (S.nuda) frases.push("Se vende la nuda propiedad.");
  if (S.subasta) frases.push("Procedente de subasta.");
  if (S.negociable) frases.push("Precio negociable.");
  if (comunidad !== null) frases.push(S.comunidadTrimestral ? `Gastos de comunidad: ${comunidad * 3} € al trimestre.` : `Comunidad ${comunidad} €/mes.`);
  if (ibi !== null) frases.push(`IBI ${ibi} € al año.`);
  if (certificado === "en_tramite") frases.push("Certificado energético en trámite.");
  else if (certificado && g.si(0.5)) frases.push(`Calificación energética: ${certificado.toUpperCase()}.`);
  const unidad = operacion === "venta" ? "€" : "€/mes";
  if (S.rebaja) frases.push(`Precio rebajado: ${fmt(precio)} ${unidad} (antes ${fmt(precioAnterior!)} €).`);
  else if (S.precioEnPalabras) frases.push(`Se vende por ${enPalabrasMiles(precio)} euros.`);
  else frases.push(`Precio: ${fmt(precio)} ${unidad}.`);
  frases.push("(Inmueble ficticio de desarrollo.)");
  const descripcion = frases.join(" ");

  // --- Verdad de lo que aparece en alguna fuente ---
  const features: string[] = [];
  const featureFeed = (cond: boolean, nombre: string) => cond && features.push(nombre);
  featureFeed(f.terraza && !S.terrazaSoloTexto, "Terrace");
  featureFeed(f.ascensor, "Lift");
  featureFeed(f.aire && g.si(0.5), "Air conditioning");
  featureFeed(f.trastero && g.si(0.5), "Storage room");
  featureFeed(f.piscina === "comunitaria" && g.si(0.5), "Communal pool");
  featureFeed(f.piscina === "privada" && g.si(0.5), "Private pool");
  if (S.terrazaSoloTexto) esc_.push("terraza_solo_texto");

  v.terraza = f.terraza ? true : null;
  v.balcon = null; // no se menciona en ninguna fuente
  v.ascensor = f.ascensor ? true : S.sinAscensorExplicito ? false : null;
  v.garaje = f.garaje === "incluido" ? "incluido" : f.garaje === "opcional" ? "opcional" : null;
  v.trastero = f.trastero ? true : null;
  // El feed siempre trae <pool>: «no tiene» también se sabe (pool = 0).
  v.piscina = f.piscina;
  v.aire_acondicionado = f.aire ? true : null;
  v.calefaccion = f.calefaccion ? true : null;
  v.amueblado = f.amueblado && operacion !== "venta" ? true : null;
  v.estado = S.reformar ? "a_reformar" : estado === "reformado" ? "reformado" : estado === "a_estrenar" ? "a_estrenar" : null;
  v.luminosidad = S.luminoso === "ninguno" ? null : S.luminoso;
  v.ruido = S.tranquilo ? "muy_tranquilo" : null;
  v.orientacion = S.orientacion;
  v.vistas = S.vistasMar ? "mar" : null;
  v.gastos_comunidad = comunidad === null ? null : String(comunidad);
  v.ibi = ibi === null ? null : String(ibi);
  v.negociable = S.negociable ? true : null;
  v.alquilado_con_inquilino = S.alquilado ? true : null;
  v.vpo = S.vpo ? true : null;
  v.okupado = S.okupado ? true : null;
  v.nuda_propiedad = S.nuda ? true : null;
  v.subasta = S.subasta ? true : null;
  v.certificado_energetico = certificado;
  for (const [k, on] of Object.entries({ para_reformar: S.reformar, garaje_opcional: S.garajeOpcional, comunidad_trimestral: S.comunidadTrimestral, sin_ascensor: S.sinAscensorExplicito, alquilado_con_inquilino: S.alquilado, vpo: S.vpo, okupado: S.okupado, nuda_propiedad: S.nuda, subasta: S.subasta, util_y_construida: S.utilYConstruida, precio_en_palabras: S.precioEnPalabras, certificado_en_tramite: S.certificadoTramite }))
    if (on) esc_.push(k);

  const precioFeed = S.rebaja && S.rebajaFeedViejo ? precioAnterior! : precio;
  const energiaFeed = certificado && certificado !== "en_tramite" ? `<energy_rating><consumption>${certificado.toUpperCase()}</consumption></energy_rating>` : "";
  const xml = `  <property>
    <id>${n}</id><ref>${ref}</ref><date>2026-09-01 10:00:00</date>
    <price>${precioFeed}</price><currency>EUR</currency><price_freq>${operacion === "venta" ? "sale" : operacion === "alquiler" ? "month" : "week"}</price_freq>
    <type>${{ piso: "Apartment", atico: "Penthouse", duplex: "Duplex", casa: "House", chalet: "Villa", adosado: "Town House", estudio: "Studio", local: "Commercial", terreno: "Plot", oficina: "Office", garaje: "Garage" }[tipo]}</type>
    <town>${esc(municipio.nombre)}</town><province>Murcia</province>
    <location><latitude>${lat}</latitude><longitude>${lon}</longitude></location>
    ${habitaciones !== null ? `<beds>${habitaciones}</beds><baths>${banos}</baths>` : ""}
    <pool>${f.piscina === "no_tiene" ? 0 : 1}</pool>
    ${planta !== null ? `<floor>${planta}</floor>` : ""}
    <surface_area><built>${tipo === "terreno" ? 0 : m2}</built><plot>${v.superficie_parcela ?? 0}</plot></surface_area>
    ${energiaFeed}
    <features>${features.map((x) => `<feature>${x}</feature>`).join("")}</features>
    <desc><es>${esc(descripcion)}</es></desc>
    <images><image id="1"><url>https://example.com/ficticios/${ref}/1.jpg</url></image></images>
  </property>`;

  // El feed no trae superficie construida de terrenos (0 = no aplica): corregimos la verdad.
  if (tipo === "terreno") v.superficie_construida = null;

  let html: string | undefined;
  if (S.conHtml) {
    const precioJsonLd = S.jsonldViejo ? Math.round((precio * 1.08) / 1000) * 1000 : precio;
    html = `<!doctype html><html lang="es"><head><title>${esc(nombreTipo)} ${ref}</title>
<meta name="description" content="${esc(frases[0]!)}">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "RealEstateListing", name: `${nombreTipo} ${ref}`, offers: { "@type": "Offer", price: precioJsonLd, priceCurrency: "EUR" }, ...(tipo !== "terreno" ? { floorSize: { "@type": "QuantitativeValue", value: m2, unitCode: "MTK" } } : {}), ...(habitaciones !== null ? { numberOfBedrooms: habitaciones } : {}) })}</script>
</head><body><nav>Inicio · Comprar · Alquilar</nav><main><h1>${esc(nombreTipo)} en ${esc(zona.nombre)}</h1>
<dl>${tipo !== "terreno" ? `<dt>Superficie construida</dt><dd>${m2} m²</dd>` : ""}${habitaciones !== null ? `<dt>Habitaciones</dt><dd>${habitaciones}</dd>` : ""}</dl>
<p>${esc(descripcion)}</p></main><footer>Aviso legal</footer></body></html>`;
  }
  return { ref, escenarios: esc_, xml, html, verdad: v };
}

export function generarConjunto(n = 300, semilla = 20260924): InmuebleFicticio[] {
  return Array.from({ length: n }, (_, i) => generarInmueble(i + 1, semilla));
}

export function feedXml(inmuebles: InmuebleFicticio[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- DATOS FICTICIOS DE DESARROLLO: no corresponden a inmuebles reales. -->\n<root><kyero><feed_version>3</feed_version></kyero>\n${inmuebles.map((i) => i.xml).join("\n")}\n</root>\n`;
}
