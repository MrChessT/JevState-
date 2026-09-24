# Decisiones

Registro de decisiones: lo que la especificación no fijaba, dónde me he apartado de ella y por qué, y lo que he descubierto al leer el SDK y la documentación de Next 16. Cada entrada tiene un estado: **aplicada**, **por defecto** (valor de la sección 12, a confirmar), **pendiente** (necesita tu respuesta) o **descubrimiento** (algo que choca con la especificación; sección 11).

## Descubrimientos al leer el SDK (`@typesafe-ai/sdk` 0.6.0)

Leído en `node_modules/@typesafe-ai/sdk/dist/index.d.mts`. Ninguno bloquea, pero cambian detalles de la especificación.

### D-001 · `score` devuelve un nivel esperado y no un entero *(descubrimiento, aplicada)*
`ScoreResponse` = `{ type: "score", score: number, confidence, legend, probabilities }`. `score` es el **valor esperado** («may fall between integer rubric levels»), los niveles se indexan **desde 0** y hacen falta al menos 2.
**Consecuencia:** la escala −2…+2 del ajuste por estado (sección 5) se envía como niveles 0…4 y el código la convierte (`AJUSTE_ESTADO_NIVELES`). `gateScore` redondea al nivel más cercano dentro de la escala y aplica la puerta sobre `confidence`.

### D-002 · Instrucciones y descripciones pueden ser JSON *(descubrimiento, aplicada)*
`instructions` y cada descripción de `choice` aceptan `EntryType` (texto, objeto o array).
**Uso:** las preguntas con datos variables mandan un objeto (`{ question, mention: "cartajena" }`) en lugar de meter el texto del usuario dentro de la frase. Así el mensaje del usuario sigue siendo un dato y no parte de la instrucción, lo que ayuda contra la inyección. Los candidatos numéricos llevan `{ value, source, excerpt }`.

### D-003 · Variables de entorno del SDK *(descubrimiento, aplicada)*
El SDK lee `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL` y `TYPESAFE_DEFAULT_MODEL`; la especificación usa `JEV_BASE_URL` y `JEV_MODEL`. Se respetan las de la especificación y se pasan explícitamente al constructor, así que las del SDK no intervienen.

### D-004 · Cancelación y más códigos HTTP *(descubrimiento, aplicada)*
Existe `APIUserAbortError` (el llamante canceló). He añadido el código **`aborted`** a los cinco de la especificación: no es una caída de Jev y no cuenta en las métricas de error. Mapeo: 401 y 403 → `auth`; 400, 404 y 422 → `invalid_request`; 429 → `rate_limited` (con `retryAfterMs`); `APITimeoutError` → `timeout`; conexión y 5xx → `unavailable`.

### D-005 · Reintentos y timeout del SDK *(descubrimiento, aplicada)*
Por defecto el SDK hace 2 reintentos (408, 429, 5xx) con backoff, y el timeout es **por intento**, sin presupuesto total. En tiempo real eso podría pasarse del objetivo de latencia.
**Valores por defecto:** `JEV_TIMEOUT_MS=4000` y `JEV_MAX_RETRIES=1`. Para el pipeline en segundo plano se podrán usar valores más holgados por llamada.

### D-006 · Solo existen `choice`, `noul` y `score` *(confirmado)*
No hay tipos nativos para enteros, divisas ni texto. Se aplica el patrón SDE de la sección 1.1 tal cual.

## Repositorio y proceso

### D-010 · Ubicación del proyecto *(aplicada)*
Por tu indicación, el proyecto vive en `MrChessT/JevState-`, que estaba vacío. Se desarrolla en `main`, que pasa a ser la rama por defecto. A partir de aquí, cada fase irá en su rama con PR, para que la CI la valide antes de integrarla.

### D-011 · Qué se reutiliza de nexo y qué se mejora *(aplicada)*
Lo que se reutiliza: el patrón JevPort, la caché por hash, los errores tipados, FakeJev, las puertas y la política por contexto, los umbrales sobrescribibles por entorno, el verificador de cifras (se portará en la fase 4) y la CI con pgTAP.
Las mejoras:
- La versión del catálogo entra en la clave de caché y se calcula por hash; un test impide cambiar un texto sin subir la versión.
- Los umbrales declaran su sentido (`confianza`, `si_bueno`, `si_malo`) y se validan por coherencia.
- Las peticiones idénticas en vuelo se comparten, salvo las que llevan señal de cancelación.
- FakeJev reparte el peso del `score` entre niveles y rechaza opciones inexistentes.
- `docs/CATALOGO_JEV.md` se genera desde el código y no puede desincronizarse.
- La evaluación tiene una línea base versionada y una regla de cero datos inventados.

## Plano de control y catálogo

### D-020 · Dos catálogos con versión propia *(aplicada)*
El **catálogo de datos** (las tres pestañas de Sheets) y el **catálogo del asistente** (preguntas de las llamadas 1 y 2 y de la valoración) se versionan por separado, porque cambian a ritmos distintos y se evalúan con sets distintos. Cada decisión de Jev guarda la versión del catálogo del que salió su pregunta.

### D-021 · Las preguntas del asistente viven en código, por ahora *(aplicada)*
La especificación define Sheets con tres pestañas (datos) y pide que el backoffice pueda editar «preguntas del asistente y umbrales». En la fase 0, las preguntas del asistente están en `src/asistente/catalogo.ts`: su forma depende de lo que extrae el código (zonas candidatas, cifras…) y es más seguro revisarlas en un PR. La edición desde el backoffice (fase 5) exportará e importará al mismo formato y pasará por `catalog:compile`, que ejecuta la evaluación. **Nunca** se editarán en vivo.

### D-022 · Formato de las celdas de la hoja *(aplicada)*
Opciones: `clave: descripción | clave: descripción`. Listas: `a|b|c`. Prioridad de fuentes: `feed>jsonld>…`. Tolerancia: `1%` (relativa) o `0` (absoluta). Condición: `campo = valor` o `campo in (a, b)`. Booleanos de configuración: `si`/`no`. Si las pestañas tienen columnas de más o de menos, la compilación falla con un mensaje claro.

### D-023 · Comprobación de idioma *(aplicada)*
El compilador rechaza textos con caracteres o palabras frecuentes del español (se permiten las siglas legales IBI y VPO, y los literales entre comillas) y claves en inglés (`yes`, `none`, `other`…). Es una heurística: evita los errores típicos, pero no sustituye a revisar el texto.

### D-024 · Campos añadidos a los de la especificación *(aplicada; revísalos)*
Se han añadido `superficie_parcela`, `planta_tipo`, `vistas`, `accesible`, `amueblado`, `ruido` y `calidad_acabados` (ordinales), `direccion` y `referencia_catastral` (texto, no públicos). También cambian algunos tipos:
- `garaje` pasa a enum (`incluido` / `opcional` / `no_tiene`), porque la especificación distingue entre incluido y opcional.
- `piscina` pasa a enum (`privada` / `comunitaria` / `no_tiene`).
- `exterior` pasa a enum (`exterior` / `interior`).

Los campos legales de alto impacto (`vpo`, `okupado`, `nuda_propiedad`, `subasta`, `cargas_mencionadas`) exigen act ≥ 0,9. `rentabilidad_declarada` no es público: solo sirve como evidencia.

### D-025 · `zona` no la decide Jev *(aplicada)*
En el paquete `core`, `zona` es de tipo `text` con extractor `geocode`: sale de la geocodificación y de la agregación a barrio y municipio (código), no de una pregunta.

## Umbrales y política

### D-030 · Umbrales que la especificación no fijaba *(por defecto; se calibrarán con `eval:sweep`)*
Además de los de la sección 4.3, estos son valores iniciales razonables, a medir en la fase 7:

| Clave | Valor |
| --- | --- |
| `operacion`, `tipo`, `presupuesto_tipo`, `requisito` | 0,7 / 0,45 |
| `proximidad`, `prioridad`, `feedback_motivo` | 0,6 / 0,4 |
| `perfil_declarado` | 0,8 / 0,8 (con duda se ignora, nunca se pregunta por el perfil) |
| `inmueble_ref` | 0,75 / 0,45, margen 0,25 |
| `campo_pregunta` | 0,7 / 0,45, margen 0,2 |
| `ambiguo` | se sigue si ≤ 0,3; se para si > 0,6 |
| `encaje` | 0,5 / 0,3 |
| `deseable` | 0,8 / 0,5 |
| `comparable` | 0,7 / 0,5 |
| `ajuste_estado` | 0,6 / 0,4 |

### D-031 · Umbral de intención de «valorar mi vivienda» *(aplicada)*
Su riesgo es «medio», pero no escribe nada hasta que el usuario pide que le llame un agente, y eso ya es una acción de riesgo alto con confirmación. Por eso usa el umbral de lectura.

### D-032 · Relajación por evidencia literal *(aplicada)*
−0,15 en act y ask, y el margen mínimo se reduce a la mitad. Nunca en riesgo alto ni en alarmas (`inyeccion`, `ambiguo`).

## Datos y seguridad

### D-040 · Zonas y POI sin `agency_id` *(aplicada)*
Son datos geográficos abiertos y compartidos. Lo que es de la agencia, como el contenido SEO de cada zona, va en `zone_content`, que sí lleva `agency_id`. El test de estructura comprueba que todas las demás tablas de negocio tienen `agency_id`.

### D-041 · Datos privados en una tabla aparte *(aplicada)*
Dirección exacta, ubicación exacta, propietario, comisión y notas del agente van en `listing_private`, que solo leen el admin y el agente de la agencia. El portal usa `location_public`, que es aproximada. Así, ni el portal ni el asistente pueden filtrarlos por error.

### D-042 · `agents.user_id` no es legible *(aplicada)*
La ficha pública del equipo se lee con permisos por columna y sin `user_id`. El backoffice obtiene las membresías del usuario actual con la RPC `mis_membresias()`.

### D-043 · Uso de la `service_role` *(aplicada)*
Solo en trabajos en segundo plano (ingesta, enriquecimiento, purga por retención y la cola `jobs`) y, en fases posteriores, en RPC públicas acotadas: crear lead, pedir visita y alta de alerta, con validación y límites de frecuencia. El portal y el backoffice van siempre con el JWT del usuario y RLS.

### D-044 · Correcciones manuales protegidas por trigger *(aplicada)*
Pasar un campo de `manual` a otro método lanza una excepción (`correccion_manual`). El pipeline debe saltarse esos campos. Es preferible que falle con claridad a que se pierda en silencio una corrección humana.

### D-045 · Acceso al CRM *(por defecto)*
El admin y los agentes ven todos los leads de su agencia, no solo los asignados, que es lo razonable en una agencia pequeña. El editor no ve el CRM ni los datos privados. Si quieres que cada agente vea solo lo suyo, es un cambio de política acotado.

### D-046 · Cola de trabajos en Postgres *(aplicada)*
Tabla `jobs` con `FOR UPDATE SKIP LOCKED`, `dedupe_key` para la idempotencia, backoff exponencial (10 s × 2ⁿ, con un máximo de 1 h) y estado `fallido` tras `max_attempts`. No hace falta otro servicio. Si el volumen lo pide, se cambia por una cola gestionada con la misma interfaz.

### D-047 · Datos ficticios *(aplicada)*
Hay una columna `listings.is_fictitious` y una variable `NEXT_PUBLIC_DATOS_FICTICIOS` que muestra el aviso en el pie. El generador de los 300 inmuebles ficticios es de la **fase 1**, junto con los normalizadores que los procesan.

## Portal

### D-050 · URLs e idiomas *(aplicada)*
El español va sin prefijo porque es la URL canónica de la especificación (`/venta/murcia/centro/piso-3-hab-ref-1234`); el inglés, con `/en` y el primer segmento traducido (`/en/sale/…`). `x-default` apunta al español. Si llega `/es/…` o un segmento en otro idioma, se redirige con 308 a la canónica.

### D-051 · Sin Cache Components todavía *(aplicada)*
Next 16 ofrece `cacheComponents` y `"use cache"`. En la fase 0 basta con SSG (`generateStaticParams`) y render dinámico donde hay sesión. Se evaluará en la fase 2 con las fichas y los resultados, midiendo el LCP.

### D-052 · Tipografía del sistema *(aplicada)*
Se usa la pila del sistema para el texto y una serif editorial del sistema para los títulos: no se descarga ninguna fuente y mejora el LCP (objetivo < 2,5 s en 4G). Si la marca tiene tipografía corporativa, se añade con `next/font` en `src/config/brand.ts` y `tokens.css`.

### D-053 · Refresco de sesión solo en cuenta y backoffice *(aplicada)*
Las páginas públicas no tocan cookies, así que siguen siendo estáticas y cacheables, y no hay una verificación de JWT por visita.

### D-054 · Degradación sin Supabase *(aplicada)*
En desarrollo, sin Supabase, el portal funciona y la cuenta muestra un aviso. En producción, la configuración exige Supabase y `/api/salud` responde 503 con el motivo si falta.

### D-055 · No indexable hasta la fase 2 *(aplicada)*
`robots.txt` bloquea todo y el sitemap sale vacío mientras `NEXT_PUBLIC_INDEXABLE` no sea `true`, para no indexar un portal sin inmuebles.

### D-056 · Textos legales *(pendiente de revisión jurídica)*
Son plantillas completas (LSSI-CE, RGPD/LOPDGDD, cookies), coherentes con lo que hace el sistema: minimización, no discriminación, DPA con Jev sin datos de contacto y retención de 30 días. Cada página muestra el aviso «pendiente de revisión» hasta que `LEGAL_REVISADO` sea `true`. **Tiene que revisarlos un abogado antes de publicar.**

## Evaluación

### D-060 · Qué evalúa la fase 0 *(aplicada)*
La suite sin Jev de la fase 0 es el **contrato del catálogo** (71 casos). Comprueba que cada campo y cada pregunta produce preguntas válidas del SDK, en inglés, con claves en español y del tipo correcto de ida y vuelta. Estas baterías se añaden en su fase:

| Batería | Fase |
| --- | --- |
| Extracción de precios, m², habitaciones y planta; zonas con erratas y alias; proximidad | 1 |
| Conversaciones simuladas multi-turno | 3 |
| ~150 frases etiquetadas (es/en) para la llamada 1, con Jev real | 3 |
| 50 inmuebles etiquetados para el enriquecimiento, con Jev real | 1 |

### D-061 · e2e con Supabase inalcanzable *(aplicada)*
La CI de e2e apunta a propósito a un Supabase que no existe, para demostrar que el portal público no depende de él. Los recorridos con sesión real (cuenta, visita) se añadirán con Supabase local en la fase 5.

## Fase 1 · Datos

### D-100 · Normalizadores compartidos *(aplicada)*
`src/extraccion/` sirve al pipeline (fichas) y servirá al asistente (mensajes): un solo código para leer «250k», «doscientos cincuenta mil», «3ª planta» o «sin ascensor». Todo importe se calcula con decimal.js.

### D-101 · Cifras ambiguas *(aplicada)*
«1,500» puede ser 1,5 o 1.500. El código no elige: la cifra lleva `alternativas` y ambas entran como candidatas en la adjudicación, así que decide Jev (o la revisión humana).

### D-102 · Contexto de los importes *(aplicada)*
El contexto (precio, precio anterior, comunidad, IBI, fianza, €/m², garaje, cuota) se busca dentro de la misma cláusula, cortando en la puntuación. Así «Precio 235.000 € (antes 250.000 €)» no contamina un importe con el contexto del otro. El contexto es una pista para describir el candidato a Jev; no decide solo.

### D-103 · Feed XML estándar de portales *(aplicada; pendiente de tu feed real, P-4)*
El adaptador genérico lee el formato Kyero v3, el más extendido en España para intercambiar inmuebles con portales, más las etiquetas que suelen añadir los CRM (`address`, `postcode`, `floor`, `community_fees`, `ibi`, `title`). El adaptador no interpreta nada: aplana a pares ruta → literal, y la interpretación la hacen las evidencias. En el formato Kyero, `0` en `plot` o `built` significa «no aplica»: no se convierte en una evidencia de 0 m².

### D-104 · Referencia catastral *(aplicada)*
Se valida el formato (20 caracteres: 7 + 7 + 4 + 2) pero no se recalculan los dígitos de control. Si se necesita, se añade la validación con el algoritmo oficial y sus casos de prueba.

### D-110 · Diccionario de zonas propio *(aplicada)*
Tiene los 45 municipios de la Región de Murcia con su código INE y 65 barrios o pedanías de los municipios con más mercado, con alias y erratas frecuentes («cartajena», «la ribera», «lo pagan»). La migración 0008 se genera desde el mismo archivo (`npm run zonas:sql`, comprobado en la CI), así que el código y la base de datos no divergen. «La Manga» existe en Cartagena y en San Javier: la búsqueda devuelve ambas, y en el asistente decidirá Jev con `zona_i` (o se ampliará a las dos, según la política de buscar).

### D-111 · Geometrías y colindancias aproximadas *(pendiente)*
Los centroides son aproximados (±1-2 km) y las colindancias se han escrito a mano. Cuando se carguen los límites oficiales del CNIG/IGN, `app.recalcular_colindancias()` las calcula con `ST_Touches` y la geocodificación pasa a usar punto-en-polígono. Hasta entonces, el barrio de un inmueble con coordenadas es el barrio más cercano de su municipio (radio de 2,5 km).

### D-112 · Geocodificador *(aplicada)*
Es local y determinista: usa las coordenadas del feed, el municipio (con erratas), el código postal y la dirección. Si el código postal contradice al municipio, la confianza baja y la zona va a revisión. CartoCiudad (IGN, sin clave) puede enchufarse detrás de `GeocoderPort` para direcciones sin coordenadas.

### D-113 · Ubicación pública aproximada *(aplicada)*
El portal nunca muestra la ubicación exacta: se desplaza entre 120 y 250 m, en una dirección fija por inmueble (determinista). La exacta queda en `listing_private`.

### D-114 · Puntos de interés de OpenStreetMap *(aplicada; la importación está pendiente de red)*
La consulta Overpass (playa, colegios y guarderías, estaciones y paradas, hospitales y centros de salud, supermercados) y su parser tienen tests. **La política de red de este entorno bloquea overpass-api.de**, así que la importación (`npm run poi:importar`) se ejecutará en el despliegue o donde haya salida. Por inmueble se guardan los 3 puntos más cercanos de cada categoría dentro de un radio por categoría. Licencia ODbL: se cita «© OpenStreetMap contributors».

### D-120 · Mini cuando el texto coincide *(aplicada)*
La especificación dice «mini si no hay otra evidencia que lo contradiga» y «verify cuando hay valor estructurado y texto». Criterio aplicado:
- Si el texto dice lo mismo que la fuente estructurada **sin matices**, no la contradice y basta la etapa mini (+0,03 de confianza).
- Si el texto trae un matiz, se verifica con Jev. Matices: otro contexto («antes 250.000» para el precio), una cifra ambigua o una superficie sin tipo.

Así Jev solo trabaja donde aporta algo.

### D-121 · Jev caído en el pipeline *(aplicada)*
Cada paquete se reintenta 3 veces con backoff. Si aun así falla, el trabajo falla y la cola lo reintenta más tarde (10 s × 2ⁿ, hasta 1 h). En el **último** intento, el worker usa el modo `sin_jev`:
- lo estructurado sin conflicto se acepta (mini);
- lo demás muestra la fuente más fuerte **marcada** como «revisar» y va a la cola de revisión.

Un Jev caído no bloquea la publicación y no se inventa nada (evaluación: 0 inventados en modo sin Jev).

### D-122 · El «no» de Jev en los booleanos *(aplicada)*
Las preguntas booleanas del catálogo definen el «no» como «no tiene o no se menciona». Por eso un «no» solo se guarda como `false` si hay una evidencia negativa explícita («sin ascensor», `pool = 0`); si no la hay, el campo queda como `no_consta`. Decir «no tiene terraza» cuando el anuncio no habla de ella sería inventar.

### D-123 · Ordinales con «¿consta?» *(aplicada)*
`score` siempre devuelve un nivel, aunque el anuncio no diga nada. Por eso cada ordinal (estado, luminosidad, ruido, acabados) va acompañado de un `noul` «¿el anuncio dice algo de esto?», y el nivel solo se acepta si la respuesta es sí.

### D-124 · Citar la descripción completa *(aplicada)*
Si Jev deduce un atributo que ningún extractor encontró (por ejemplo, «zona chill-out en la azotea» como terraza), el campo cita una evidencia que es la descripción completa. Así, todo valor tiene su evidencia y la cola de revisión puede mostrar de dónde sale.

### D-125 · Obligatorio salvo por tipo *(aplicada)*
`required_for_publish` admite `si salvo tipo in (local, terreno…)`: un terreno no tiene habitaciones y un local no tiene dormitorios. El compilador valida que los valores existan en el enumerado. Sin esto, los terrenos y los locales nunca se habrían podido publicar.

### D-126 · Estado de publicación *(aplicada)*
Un inmueble nuevo se publica solo si todos sus campos obligatorios están confirmados o son probables. Si no, queda en borrador y los campos que faltan van a la cola de revisión. Una vez creado, el pipeline no cambia su estado: lo gestiona el equipo.

### D-127 · Datos ficticios y verdad de referencia *(aplicada)*
`npm run ficticios` genera 300 inmuebles deterministas, con referencia `FIC-`, la marca `ficticio`, un aviso en la descripción y un comentario en el XML. El generador produce también la **verdad** de cada campo (lo que se sabe leyendo todas las fuentes; si no aparece en ninguna, «no consta»). Los archivos van a `datos/ficticios/`, que no se versiona.

### D-128 · Qué mide la evaluación de la fase 1 *(aplicada)*
- **Baterías sin Jev**: 207 casos de normalizadores, 327 de zonas con erratas y 25 de proximidad.
- **Pipeline con oráculo**: los 300 ficticios con un Jev que responde según la verdad. Mide todo lo que no es Jev (extracción, cascada, puertas, adjudicación) con un Jev perfecto. Resultado: 100 % y 0 inventados.
- **Pipeline sin Jev**: 96,9 % de campos correctos, 0 inventados y 0 errores confirmados; lo dudoso queda marcado como «revisar».
- **Pipeline con Jev real** (`npm run eval:jev`): los 50 primeros ficticios, con la misma verdad. Cuando haya inmuebles reales, se sustituirán por 50 etiquetados a mano (sección 8).

## Pendiente de tu respuesta

| # | Pregunta | Mientras tanto |
| --- | --- | --- |
| P-1 | Nombre comercial, razón social, NIF, colores, datos de contacto y registro de agentes | `{{NOMBRE_INMOBILIARIA}}`, paleta neutra (`src/config/brand.ts`) |
| P-2 | Proyecto de Supabase (URL, anon key, service role) y proyecto de Vercel | Local y CI; sin despliegue |
| P-3 | Clave de TypeSafe (o AI Gateway) para medir con Jev real | FakeJev; `eval-jev.yml` preparado |
| P-4 | Un ejemplo real del feed XML/JSON del CRM de la agencia | Adaptador genérico con formato XML estándar de portales (fase 1) |
| P-5 | Proveedor de teselas del mapa (MapTiler, Stadia, propio…) | Configurable; se decide en la fase 2 |
| P-6 | ¿Hoja de Google Sheets para el plano de control? (ID y API key de solo lectura) | CSV en `catalog/source/` |
| P-7 | Revisión de los campos añadidos (D-024) y de los umbrales por defecto (D-030) | Valores de este documento |
