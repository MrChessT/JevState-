// Tipografía: Inter para el texto (legible en pantallas pequeñas y en cifras) y Fraunces para
// títulos (serif editorial, cálida). next/font las descarga en el build y las sirve desde el propio
// dominio: el navegador no hace ninguna petición a Google.
import { Fraunces, Inter } from "next/font/google";

export const fuenteTexto = Inter({ subsets: ["latin"], display: "swap", variable: "--fuente-inter" });
export const fuenteTitulos = Fraunces({ subsets: ["latin"], display: "swap", variable: "--fuente-fraunces", axes: ["opsz", "SOFT"] });
