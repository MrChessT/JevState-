// Zonas de la Región de Murcia: los 45 municipios (código INE) y barrios o pedanías de los
// municipios con más mercado. Fuente de nombres: INE / Región de Murcia (datos abiertos).
// COORDENADAS APROXIMADAS (centroides, ±1-2 km): sirven para geocodificar por texto y calcular
// distancias orientativas hasta cargar las geometrías oficiales del CNIG (D-111). Las colindancias
// son también aproximadas y se recalculan con ST_Touches al cargar las geometrías.

export interface Municipio {
  ine: string;
  slug: string;
  nombre: string;
  alias: string[];
  lat: number;
  lon: number;
  costa: boolean;
  /** Prefijos o códigos postales que identifican el municipio (orientativo). */
  cp: string[];
}

export interface Barrio {
  municipio: string;
  slug: string;
  nombre: string;
  alias: string[];
  lat: number;
  lon: number;
  costa?: boolean;
}

export const MUNICIPIOS: Municipio[] = [
  { ine: "30001", slug: "abanilla", nombre: "Abanilla", alias: [], lat: 38.206, lon: -1.041, costa: false, cp: ["30640"] },
  { ine: "30002", slug: "abaran", nombre: "Abarán", alias: [], lat: 38.204, lon: -1.4, costa: false, cp: ["30550"] },
  { ine: "30003", slug: "aguilas", nombre: "Águilas", alias: [], lat: 37.4063, lon: -1.5829, costa: true, cp: ["30880", "30889"] },
  { ine: "30004", slug: "albudeite", nombre: "Albudeite", alias: [], lat: 38.029, lon: -1.386, costa: false, cp: ["30190"] },
  { ine: "30005", slug: "alcantarilla", nombre: "Alcantarilla", alias: [], lat: 37.9694, lon: -1.217, costa: false, cp: ["30820"] },
  { ine: "30006", slug: "aledo", nombre: "Aledo", alias: [], lat: 37.796, lon: -1.573, costa: false, cp: ["30859"] },
  { ine: "30007", slug: "alguazas", nombre: "Alguazas", alias: [], lat: 38.052, lon: -1.242, costa: false, cp: ["30560"] },
  { ine: "30008", slug: "alhama-de-murcia", nombre: "Alhama de Murcia", alias: ["alhama"], lat: 37.8519, lon: -1.4253, costa: false, cp: ["30840", "30848"] },
  { ine: "30009", slug: "archena", nombre: "Archena", alias: [], lat: 38.116, lon: -1.3, costa: false, cp: ["30600"] },
  { ine: "30010", slug: "beniel", nombre: "Beniel", alias: [], lat: 38.046, lon: -1.001, costa: false, cp: ["30130"] },
  { ine: "30011", slug: "blanca", nombre: "Blanca", alias: [], lat: 38.179, lon: -1.374, costa: false, cp: ["30540"] },
  { ine: "30012", slug: "bullas", nombre: "Bullas", alias: [], lat: 38.046, lon: -1.67, costa: false, cp: ["30180"] },
  { ine: "30013", slug: "calasparra", nombre: "Calasparra", alias: [], lat: 38.23, lon: -1.699, costa: false, cp: ["30420"] },
  { ine: "30014", slug: "campos-del-rio", nombre: "Campos del Río", alias: [], lat: 38.039, lon: -1.355, costa: false, cp: ["30191"] },
  { ine: "30015", slug: "caravaca-de-la-cruz", nombre: "Caravaca de la Cruz", alias: ["caravaca"], lat: 38.106, lon: -1.862, costa: false, cp: ["30400"] },
  { ine: "30016", slug: "cartagena", nombre: "Cartagena", alias: ["cartajena", "ctg"], lat: 37.6257, lon: -0.9966, costa: true, cp: ["302", "30300", "30310", "30320", "30330", "30350", "30353", "30365", "30366", "30367", "30368", "30369", "30370", "30380", "30385", "30390", "30394", "30395", "30396", "30398"] },
  { ine: "30017", slug: "cehegin", nombre: "Cehegín", alias: [], lat: 38.092, lon: -1.799, costa: false, cp: ["30430"] },
  { ine: "30018", slug: "ceuti", nombre: "Ceutí", alias: [], lat: 38.079, lon: -1.273, costa: false, cp: ["30562"] },
  { ine: "30019", slug: "cieza", nombre: "Cieza", alias: [], lat: 38.2394, lon: -1.4189, costa: false, cp: ["30530"] },
  { ine: "30020", slug: "fortuna", nombre: "Fortuna", alias: [], lat: 38.181, lon: -1.125, costa: false, cp: ["30620"] },
  { ine: "30021", slug: "fuente-alamo-de-murcia", nombre: "Fuente Álamo de Murcia", alias: ["fuente alamo"], lat: 37.723, lon: -1.169, costa: false, cp: ["30320", "30332", "30333", "30334", "30335"] },
  { ine: "30022", slug: "jumilla", nombre: "Jumilla", alias: [], lat: 38.475, lon: -1.329, costa: false, cp: ["30520"] },
  { ine: "30023", slug: "librilla", nombre: "Librilla", alias: [], lat: 37.887, lon: -1.356, costa: false, cp: ["30892"] },
  { ine: "30024", slug: "lorca", nombre: "Lorca", alias: [], lat: 37.6771, lon: -1.7003, costa: true, cp: ["30800", "3081", "3088", "30890", "30891"] },
  { ine: "30025", slug: "lorqui", nombre: "Lorquí", alias: [], lat: 38.082, lon: -1.251, costa: false, cp: ["30564"] },
  { ine: "30026", slug: "mazarron", nombre: "Mazarrón", alias: ["mazaron"], lat: 37.599, lon: -1.3149, costa: true, cp: ["30870", "30860", "30868", "30875", "30877"] },
  { ine: "30027", slug: "molina-de-segura", nombre: "Molina de Segura", alias: ["molina"], lat: 38.0546, lon: -1.2076, costa: false, cp: ["30500", "30506", "30507"] },
  { ine: "30028", slug: "moratalla", nombre: "Moratalla", alias: [], lat: 38.189, lon: -1.891, costa: false, cp: ["30440"] },
  { ine: "30029", slug: "mula", nombre: "Mula", alias: [], lat: 38.042, lon: -1.49, costa: false, cp: ["30170"] },
  { ine: "30030", slug: "murcia", nombre: "Murcia", alias: ["murcia capital", "murcia ciudad"], lat: 37.9922, lon: -1.1307, costa: false, cp: ["300", "30100", "30110", "30120", "30150", "30151", "30152", "30153", "30155", "30157", "30160", "30161", "30162", "30163", "30165", "30166", "30167", "30169", "30176", "30177", "30579", "30590", "30835", "30833", "30831"] },
  { ine: "30031", slug: "ojos", nombre: "Ojós", alias: [], lat: 38.148, lon: -1.344, costa: false, cp: ["30611"] },
  { ine: "30032", slug: "pliego", nombre: "Pliego", alias: [], lat: 37.99, lon: -1.501, costa: false, cp: ["30176"] },
  { ine: "30033", slug: "puerto-lumbreras", nombre: "Puerto Lumbreras", alias: [], lat: 37.563, lon: -1.809, costa: false, cp: ["30890"] },
  { ine: "30034", slug: "ricote", nombre: "Ricote", alias: [], lat: 38.153, lon: -1.365, costa: false, cp: ["30610"] },
  { ine: "30035", slug: "san-javier", nombre: "San Javier", alias: [], lat: 37.8063, lon: -0.8375, costa: true, cp: ["30730", "30720", "30739"] },
  { ine: "30036", slug: "san-pedro-del-pinatar", nombre: "San Pedro del Pinatar", alias: ["san pedro", "pinatar"], lat: 37.835, lon: -0.791, costa: true, cp: ["30740"] },
  { ine: "30037", slug: "torre-pacheco", nombre: "Torre-Pacheco", alias: ["torre pacheco", "pacheco"], lat: 37.7431, lon: -0.9533, costa: false, cp: ["30700", "30709", "30739"] },
  { ine: "30038", slug: "las-torres-de-cotillas", nombre: "Las Torres de Cotillas", alias: ["torres de cotillas"], lat: 38.028, lon: -1.241, costa: false, cp: ["30565"] },
  { ine: "30039", slug: "totana", nombre: "Totana", alias: [], lat: 37.7689, lon: -1.5003, costa: false, cp: ["30850"] },
  { ine: "30040", slug: "ulea", nombre: "Ulea", alias: [], lat: 38.141, lon: -1.329, costa: false, cp: ["30612"] },
  { ine: "30041", slug: "la-union", nombre: "La Unión", alias: ["la union"], lat: 37.619, lon: -0.877, costa: true, cp: ["30360", "30364"] },
  { ine: "30042", slug: "villanueva-del-rio-segura", nombre: "Villanueva del Río Segura", alias: ["villanueva del segura"], lat: 38.136, lon: -1.323, costa: false, cp: ["30613"] },
  { ine: "30043", slug: "yecla", nombre: "Yecla", alias: [], lat: 38.6135, lon: -1.115, costa: false, cp: ["30510"] },
  { ine: "30044", slug: "santomera", nombre: "Santomera", alias: [], lat: 38.061, lon: -1.049, costa: false, cp: ["30140"] },
  { ine: "30045", slug: "los-alcazares", nombre: "Los Alcázares", alias: ["alcazares"], lat: 37.7442, lon: -0.8505, costa: true, cp: ["30710"] },
];

export const BARRIOS: Barrio[] = [
  // Murcia
  { municipio: "murcia", slug: "centro", nombre: "Centro", alias: ["casco antiguo", "centro historico", "catedral", "santa catalina", "san bartolome", "san nicolas", "san pedro murcia", "plaza circular", "gran via"], lat: 37.984, lon: -1.1285 },
  { municipio: "murcia", slug: "el-carmen", nombre: "El Carmen", alias: ["barrio del carmen", "carmen"], lat: 37.978, lon: -1.13 },
  { municipio: "murcia", slug: "la-flota", nombre: "La Flota", alias: ["flota"], lat: 37.9985, lon: -1.126 },
  { municipio: "murcia", slug: "vistalegre", nombre: "Vistalegre", alias: ["vista alegre"], lat: 38.0, lon: -1.119 },
  { municipio: "murcia", slug: "santa-maria-de-gracia", nombre: "Santa María de Gracia", alias: [], lat: 37.997, lon: -1.137 },
  { municipio: "murcia", slug: "el-ranero", nombre: "El Ranero", alias: ["ranero"], lat: 38.005, lon: -1.137 },
  { municipio: "murcia", slug: "juan-carlos-i", nombre: "Juan Carlos I", alias: ["zona norte", "juan carlos primero"], lat: 38.01, lon: -1.127 },
  { municipio: "murcia", slug: "infante-juan-manuel", nombre: "Infante Juan Manuel", alias: ["infante"], lat: 37.975, lon: -1.125 },
  { municipio: "murcia", slug: "santiago-el-mayor", nombre: "Santiago el Mayor", alias: [], lat: 37.976, lon: -1.14 },
  { municipio: "murcia", slug: "espinardo", nombre: "Espinardo", alias: [], lat: 38.011, lon: -1.157 },
  { municipio: "murcia", slug: "el-palmar", nombre: "El Palmar", alias: ["palmar"], lat: 37.938, lon: -1.16 },
  { municipio: "murcia", slug: "la-alberca", nombre: "La Alberca", alias: ["alberca"], lat: 37.94, lon: -1.133 },
  { municipio: "murcia", slug: "churra", nombre: "Churra", alias: [], lat: 38.025, lon: -1.145 },
  { municipio: "murcia", slug: "cabezo-de-torres", nombre: "Cabezo de Torres", alias: [], lat: 38.029, lon: -1.119 },
  { municipio: "murcia", slug: "puente-tocinos", nombre: "Puente Tocinos", alias: [], lat: 37.987, lon: -1.096 },
  { municipio: "murcia", slug: "guadalupe", nombre: "Guadalupe", alias: [], lat: 38.002, lon: -1.165 },
  { municipio: "murcia", slug: "beniajan", nombre: "Beniaján", alias: [], lat: 37.979, lon: -1.066 },
  { municipio: "murcia", slug: "algezares", nombre: "Algezares", alias: [], lat: 37.951, lon: -1.111 },
  { municipio: "murcia", slug: "sangonera-la-verde", nombre: "Sangonera la Verde", alias: ["sangonera"], lat: 37.936, lon: -1.201 },
  { municipio: "murcia", slug: "torreaguera", nombre: "Torreagüera", alias: [], lat: 37.979, lon: -1.055 },
  // Cartagena
  { municipio: "cartagena", slug: "casco-antiguo", nombre: "Casco Antiguo", alias: ["centro", "casco historico"], lat: 37.599, lon: -0.984 },
  { municipio: "cartagena", slug: "ensanche", nombre: "Ensanche", alias: ["ensanche almarjal", "almarjal"], lat: 37.609, lon: -0.98 },
  { municipio: "cartagena", slug: "barrio-peral", nombre: "Barrio Peral", alias: ["peral"], lat: 37.616, lon: -0.992 },
  { municipio: "cartagena", slug: "san-anton", nombre: "San Antón", alias: [], lat: 37.613, lon: -0.974 },
  { municipio: "cartagena", slug: "los-dolores", nombre: "Los Dolores", alias: [], lat: 37.625, lon: -0.993 },
  { municipio: "cartagena", slug: "santa-lucia", nombre: "Santa Lucía", alias: [], lat: 37.597, lon: -0.971 },
  { municipio: "cartagena", slug: "cabo-de-palos", nombre: "Cabo de Palos", alias: [], lat: 37.632, lon: -0.693, costa: true },
  { municipio: "cartagena", slug: "la-manga", nombre: "La Manga (Cartagena)", alias: ["la manga", "la manga del mar menor", "manga"], lat: 37.64, lon: -0.715, costa: true },
  { municipio: "cartagena", slug: "playa-honda", nombre: "Playa Honda", alias: [], lat: 37.639, lon: -0.755, costa: true },
  { municipio: "cartagena", slug: "mar-de-cristal", nombre: "Mar de Cristal", alias: [], lat: 37.65, lon: -0.747, costa: true },
  { municipio: "cartagena", slug: "los-belones", nombre: "Los Belones", alias: [], lat: 37.62, lon: -0.776 },
  { municipio: "cartagena", slug: "los-urrutias", nombre: "Los Urrutias", alias: [], lat: 37.677, lon: -0.833, costa: true },
  { municipio: "cartagena", slug: "los-nietos", nombre: "Los Nietos", alias: [], lat: 37.651, lon: -0.793, costa: true },
  { municipio: "cartagena", slug: "islas-menores", nombre: "Islas Menores", alias: [], lat: 37.645, lon: -0.803, costa: true },
  { municipio: "cartagena", slug: "el-algar", nombre: "El Algar", alias: ["algar"], lat: 37.649, lon: -0.871 },
  { municipio: "cartagena", slug: "pozo-estrecho", nombre: "Pozo Estrecho", alias: [], lat: 37.705, lon: -0.995 },
  { municipio: "cartagena", slug: "la-aljorra", nombre: "La Aljorra", alias: ["aljorra"], lat: 37.689, lon: -1.062 },
  { municipio: "cartagena", slug: "isla-plana", nombre: "Isla Plana", alias: [], lat: 37.578, lon: -1.192, costa: true },
  { municipio: "cartagena", slug: "canteras", nombre: "Canteras", alias: [], lat: 37.613, lon: -1.035 },
  // San Javier
  { municipio: "san-javier", slug: "centro", nombre: "San Javier centro", alias: ["centro"], lat: 37.8063, lon: -0.8375 },
  { municipio: "san-javier", slug: "santiago-de-la-ribera", nombre: "Santiago de la Ribera", alias: ["la ribera", "santiago ribera", "ribera"], lat: 37.797, lon: -0.807, costa: true },
  { municipio: "san-javier", slug: "la-manga", nombre: "La Manga (San Javier)", alias: ["la manga", "la manga del mar menor", "manga"], lat: 37.72, lon: -0.752, costa: true },
  { municipio: "san-javier", slug: "el-mirador", nombre: "El Mirador", alias: [], lat: 37.817, lon: -0.821 },
  { municipio: "san-javier", slug: "roda", nombre: "Roda", alias: [], lat: 37.803, lon: -0.872 },
  // San Pedro del Pinatar
  { municipio: "san-pedro-del-pinatar", slug: "centro", nombre: "San Pedro del Pinatar centro", alias: ["centro"], lat: 37.835, lon: -0.791 },
  { municipio: "san-pedro-del-pinatar", slug: "lo-pagan", nombre: "Lo Pagán", alias: ["lo pagan"], lat: 37.819, lon: -0.78, costa: true },
  { municipio: "san-pedro-del-pinatar", slug: "los-cuarteros", nombre: "Los Cuarteros", alias: [], lat: 37.842, lon: -0.808 },
  // Los Alcázares
  { municipio: "los-alcazares", slug: "centro", nombre: "Los Alcázares centro", alias: ["centro"], lat: 37.7442, lon: -0.8505, costa: true },
  { municipio: "los-alcazares", slug: "los-narejos", nombre: "Los Narejos", alias: ["narejos"], lat: 37.755, lon: -0.842, costa: true },
  // Torre-Pacheco
  { municipio: "torre-pacheco", slug: "centro", nombre: "Torre-Pacheco centro", alias: ["centro"], lat: 37.7431, lon: -0.9533 },
  { municipio: "torre-pacheco", slug: "roldan", nombre: "Roldán", alias: [], lat: 37.771, lon: -0.972 },
  { municipio: "torre-pacheco", slug: "balsicas", nombre: "Balsicas", alias: [], lat: 37.813, lon: -0.954 },
  { municipio: "torre-pacheco", slug: "dolores-de-pacheco", nombre: "Dolores de Pacheco", alias: ["dolores"], lat: 37.778, lon: -0.934 },
  // Mazarrón
  { municipio: "mazarron", slug: "centro", nombre: "Mazarrón centro", alias: ["centro", "mazarron pueblo"], lat: 37.599, lon: -1.3149 },
  { municipio: "mazarron", slug: "puerto-de-mazarron", nombre: "Puerto de Mazarrón", alias: ["el puerto", "puerto mazarron"], lat: 37.565, lon: -1.256, costa: true },
  { municipio: "mazarron", slug: "bolnuevo", nombre: "Bolnuevo", alias: [], lat: 37.56, lon: -1.298, costa: true },
  { municipio: "mazarron", slug: "camposol", nombre: "Camposol", alias: [], lat: 37.597, lon: -1.402 },
  // Águilas
  { municipio: "aguilas", slug: "centro", nombre: "Águilas centro", alias: ["centro"], lat: 37.4063, lon: -1.5829, costa: true },
  { municipio: "aguilas", slug: "calabardina", nombre: "Calabardina", alias: [], lat: 37.43, lon: -1.53, costa: true },
  // Lorca
  { municipio: "lorca", slug: "centro", nombre: "Lorca centro", alias: ["centro"], lat: 37.6771, lon: -1.7003 },
  { municipio: "lorca", slug: "la-hoya", nombre: "La Hoya", alias: [], lat: 37.739, lon: -1.644 },
  { municipio: "lorca", slug: "ramonete", nombre: "Ramonete", alias: [], lat: 37.556, lon: -1.499 },
  // Molina de Segura
  { municipio: "molina-de-segura", slug: "centro", nombre: "Molina de Segura centro", alias: ["centro"], lat: 38.0546, lon: -1.2076 },
  { municipio: "molina-de-segura", slug: "altorreal", nombre: "Altorreal", alias: [], lat: 38.085, lon: -1.229 },
  { municipio: "molina-de-segura", slug: "la-alcayna", nombre: "La Alcayna", alias: ["alcayna"], lat: 38.088, lon: -1.241 },
];

/** Colindancias aproximadas (se completan de forma simétrica). */
const COLINDANCIAS_BASE: Record<string, string[]> = {
  murcia: ["molina-de-segura", "alcantarilla", "santomera", "beniel", "alhama-de-murcia", "librilla", "fuente-alamo-de-murcia", "torre-pacheco", "san-javier", "cartagena", "las-torres-de-cotillas"],
  cartagena: ["fuente-alamo-de-murcia", "torre-pacheco", "los-alcazares", "la-union", "mazarron", "san-javier"],
  "san-javier": ["san-pedro-del-pinatar", "los-alcazares", "torre-pacheco"],
  "los-alcazares": ["torre-pacheco"],
  "torre-pacheco": ["fuente-alamo-de-murcia"],
  mazarron: ["fuente-alamo-de-murcia", "totana", "lorca"],
  lorca: ["totana", "aledo", "puerto-lumbreras", "aguilas", "caravaca-de-la-cruz", "cehegin", "mula"],
  "molina-de-segura": ["alguazas", "las-torres-de-cotillas", "lorqui", "fortuna", "abanilla", "ceuti"],
  alcantarilla: ["las-torres-de-cotillas"],
  santomera: ["abanilla", "fortuna"],
  "alhama-de-murcia": ["librilla", "totana", "mula", "fuente-alamo-de-murcia"],
  totana: ["aledo", "mula"],
  cieza: ["abaran", "calasparra", "jumilla", "moratalla", "ricote", "blanca", "fortuna"],
  abaran: ["blanca"],
  blanca: ["ricote", "ojos", "ulea", "archena"],
  archena: ["ulea", "villanueva-del-rio-segura", "ceuti", "lorqui", "molina-de-segura", "fortuna"],
  jumilla: ["yecla", "fortuna", "abanilla"],
  "caravaca-de-la-cruz": ["cehegin", "moratalla", "calasparra"],
  cehegin: ["bullas", "calasparra", "mula"],
  bullas: ["mula"],
  mula: ["pliego", "albudeite", "campos-del-rio", "librilla"],
  "campos-del-rio": ["albudeite", "las-torres-de-cotillas", "alguazas"],
  "las-torres-de-cotillas": ["alguazas"],
  alguazas: ["ceuti"],
  ceuti: ["lorqui"],
  ricote: ["ojos", "ulea"],
  ojos: ["ulea"],
  ulea: ["villanueva-del-rio-segura"],
  "puerto-lumbreras": ["aguilas"],
  "la-union": ["torre-pacheco"],
};

export function colindancias(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>(MUNICIPIOS.map((m) => [m.slug, new Set<string>()]));
  for (const [a, vecinos] of Object.entries(COLINDANCIAS_BASE)) {
    for (const b of vecinos) {
      out.get(a)?.add(b);
      out.get(b)?.add(a);
    }
  }
  return out;
}
