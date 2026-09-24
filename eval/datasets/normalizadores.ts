// Batería sin Jev de extracción (sección 8): precios, superficies, habitaciones, baños, planta,
// certificado. Casos escritos a mano + variantes de formato generadas de forma sistemática.
export interface CasoNormalizador {
  tipo: "importe" | "superficie" | "dormitorios" | "banos" | "planta" | "certificado";
  texto: string;
  /** Importe: [valor, contexto]; superficie: [m2, tipo]; recuentos: n; planta: [numero, tipo]; certificado: letra. */
  esperado: unknown;
}

const A_MANO: CasoNormalizador[] = [
  { tipo: "importe", texto: "Precio: 250.000 €", esperado: [["250000", "precio"]] },
  { tipo: "importe", texto: "Se vende por 99.900€", esperado: [["99900", "precio"]] },
  { tipo: "importe", texto: "PRECIO 1.250.000 EUR", esperado: [["1250000", "precio"]] },
  { tipo: "importe", texto: "Alquiler 650 €/mes", esperado: [["650", "precio"]] },
  { tipo: "importe", texto: "Renta mensual de 1.200 euros", esperado: [["1200", "precio"]] },
  { tipo: "importe", texto: "Antes 210.000 €, ahora 195.000 €", esperado: [["210000", "precio_anterior"], ["195000", "precio"]] },
  { tipo: "importe", texto: "Rebajado de 300.000 € a 280.000 €", esperado: [["300000", "precio_anterior"], ["280000", "precio"]] },
  { tipo: "importe", texto: "Gastos de comunidad 45 €/mes", esperado: [["45", "comunidad"]] },
  { tipo: "importe", texto: "Comunidad: 120 € trimestrales", esperado: [["120", "comunidad"]] },
  { tipo: "importe", texto: "IBI anual de 380 €", esperado: [["380", "ibi"]] },
  { tipo: "importe", texto: "Fianza de dos meses: 1.300 €", esperado: [["1300", "fianza"]] },
  { tipo: "importe", texto: "Plaza de garaje opcional por 12.000 €", esperado: [["12000", "garaje"]] },
  { tipo: "importe", texto: "A 1.850 €/m²", esperado: [["1850", "precio_m2"]] },
  { tipo: "importe", texto: "Cuota de hipoteca desde 600 € al mes", esperado: [["600", "cuota"]] },
  { tipo: "importe", texto: "Piso de 3 habitaciones, 90 m², reformado en 2019", esperado: [] },
  { tipo: "importe", texto: "Calle Mayor 250, Murcia", esperado: [] },
  { tipo: "importe", texto: "Vendo por doscientos cincuenta mil euros", esperado: [["250000", "precio"]] },
  { tipo: "importe", texto: "Precio 250k", esperado: [["250000", "precio"]] },
  { tipo: "importe", texto: "Precio 1,2 M€", esperado: [["1200000", "precio"]] },
  { tipo: "superficie", texto: "Vivienda de 90 m² construidos", esperado: [["90", "construida"]] },
  { tipo: "superficie", texto: "78 m2 útiles", esperado: [["78", "util"]] },
  { tipo: "superficie", texto: "Parcela de 1.200 m²", esperado: [["1200", "parcela"]] },
  { tipo: "superficie", texto: "Finca de 3 hectáreas", esperado: [["30000", "parcela"]] },
  { tipo: "superficie", texto: "Terraza de 25 m² y salón de 30 m²", esperado: [["25", "terraza"], ["30", "desconocida"]] },
  { tipo: "superficie", texto: "105 metros cuadrados", esperado: [["105", "desconocida"]] },
  { tipo: "superficie", texto: "Cuenta con 120 m² construidos y 100 m² útiles", esperado: [["120", "construida"], ["100", "util"]] },
  { tipo: "superficie", texto: "95 mts2", esperado: [["95", "desconocida"]] },
  { tipo: "superficie", texto: "Precio 250.000 €", esperado: [] },
  { tipo: "dormitorios", texto: "3 dormitorios", esperado: 3 },
  { tipo: "dormitorios", texto: "cuatro habitaciones dobles", esperado: 4 },
  { tipo: "dormitorios", texto: "2 hab", esperado: 2 },
  { tipo: "dormitorios", texto: "5 dorm.", esperado: 5 },
  { tipo: "dormitorios", texto: "3 bedrooms", esperado: 3 },
  { tipo: "dormitorios", texto: "un dormitorio", esperado: 1 },
  { tipo: "banos", texto: "2 baños", esperado: 2 },
  { tipo: "banos", texto: "dos baños completos", esperado: 2 },
  { tipo: "banos", texto: "1 bathroom", esperado: 1 },
  { tipo: "planta", texto: "Bajo con patio", esperado: [0, "bajo"] },
  { tipo: "planta", texto: "Primera planta", esperado: [1, "intermedia"] },
  { tipo: "planta", texto: "4ª planta con ascensor", esperado: [4, "intermedia"] },
  { tipo: "planta", texto: "planta 7", esperado: [7, "intermedia"] },
  { tipo: "planta", texto: "Ático", esperado: [null, "atico"] },
  { tipo: "planta", texto: "Entresuelo", esperado: [0, "entresuelo"] },
  { tipo: "planta", texto: "Semisótano", esperado: [-1, "sotano"] },
  { tipo: "planta", texto: "Última planta", esperado: [null, "ultima"] },
  { tipo: "planta", texto: "Piso de 3 habitaciones", esperado: null },
  { tipo: "certificado", texto: "Calificación energética: D", esperado: "d" },
  { tipo: "certificado", texto: "Certificado energético E", esperado: "e" },
  { tipo: "certificado", texto: "Eficiencia energética (A)", esperado: "a" },
  { tipo: "certificado", texto: "Certificado energético en trámite", esperado: "en_tramite" },
  { tipo: "certificado", texto: "Exento de certificado energético", esperado: "exento" },
  { tipo: "certificado", texto: "Piso amplio y luminoso", esperado: null },
];

function variantesPrecio(): CasoNormalizador[] {
  const importes = [85_000, 99_500, 120_000, 185_000, 250_000, 399_900, 1_250_000];
  const formatos: Array<(n: number) => string> = [
    (n) => `Precio: ${n.toLocaleString("es-ES").replace(/ /g, ".")} €`,
    (n) => `Precio ${n}€`,
    (n) => `Se vende por ${n.toLocaleString("es-ES").replace(/ /g, ".")} euros`,
    (n) => `€ ${n.toLocaleString("es-ES").replace(/ /g, ".")}`,
    (n) => `Precio: ${n.toLocaleString("es-ES").replace(/ /g, ".")} EUR`,
    (n) => (n % 1000 === 0 ? `precio ${n / 1000}k` : `precio ${n} €`),
    (n) => (n % 1000 === 0 && n < 1_000_000 ? `Precio ${n / 1000} mil euros` : `Precio ${n} €`),
  ];
  return importes.flatMap((n) => formatos.map((f) => ({ tipo: "importe" as const, texto: f(n), esperado: [[String(n), "precio"]] })));
}

function variantesSuperficie(): CasoNormalizador[] {
  const m2 = [35, 60, 85, 110, 145, 230];
  const formatos: Array<[(n: number) => string, string]> = [
    [(n) => `${n} m²`, "desconocida"],
    [(n) => `${n}m2`, "desconocida"],
    [(n) => `${n} metros cuadrados`, "desconocida"],
    [(n) => `${n} m² construidos`, "construida"],
    [(n) => `${n} m2 útiles`, "util"],
    [(n) => `superficie útil de ${n} m²`, "util"],
    [(n) => `parcela de ${n * 10} m²`, "parcela"],
  ];
  return m2.flatMap((n) => formatos.map(([f, tipo]) => ({ tipo: "superficie" as const, texto: f(n), esperado: [[String(tipo === "parcela" ? n * 10 : n), tipo]] })));
}

function variantesEstancias(): CasoNormalizador[] {
  const palabras = ["", "un", "dos", "tres", "cuatro", "cinco"];
  const out: CasoNormalizador[] = [];
  for (let n = 1; n <= 5; n++) {
    for (const f of [`${n} habitaciones`, `${n} dormitorios`, `${palabras[n]} dormitorios`, `${n} hab.`, `${n} dorm`]) out.push({ tipo: "dormitorios", texto: f.replace("un dormitorios", "un dormitorio"), esperado: n });
    if (n <= 3) for (const f of [`${n} baños`, `${palabras[n]} baños`, `${n} bathrooms`]) out.push({ tipo: "banos", texto: f.replace("un baños", "un baño").replace("1 baños", "1 baño").replace("1 bathrooms", "1 bathroom"), esperado: n });
  }
  return out;
}

function variantesPlanta(): CasoNormalizador[] {
  const ord = ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta"];
  const out: CasoNormalizador[] = [];
  for (let n = 1; n <= 6; n++) for (const f of [`${n}ª planta`, `planta ${n}`, `${ord[n]} planta`, `planta ${ord[n]}`, `${n}º B`]) out.push({ tipo: "planta", texto: f, esperado: [n, "intermedia"] });
  return out;
}

export const CASOS_NORMALIZADORES: CasoNormalizador[] = [...A_MANO, ...variantesPrecio(), ...variantesSuperficie(), ...variantesEstancias(), ...variantesPlanta()];
