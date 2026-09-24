# Arquitectura

Plataforma inmobiliaria con asistente dirigido por **Jev** (TypeSafe AI). Este documento describe cómo está construida y cómo encajan las piezas. Las decisiones y sus motivos están en [DECISIONES.md](DECISIONES.md); el catálogo de preguntas y los umbrales, en [CATALOGO_JEV.md](CATALOGO_JEV.md), que se genera desde el código.

> **Estado:** fases 0 (base), 1 (datos) y 2 (portal) terminadas. Las secciones marcadas *(fase N)* describen el diseño acordado para las siguientes fases; aún no hay código para ellas.

## 1. Principio rector

```
Jev decide y juzga  →  el código extrae, calcula, busca y ejecuta  →  el usuario confirma lo que tiene consecuencias
```

| Pieza | Hace | Nunca hace |
| --- | --- | --- |
| **Jev** | Responde preguntas cerradas (`choice`, `noul`, `score`) sobre un `state` JSON, en baterías de una sola petición | Producir cifras o texto libre; ver teléfonos o emails |
| **Código** | Extrae candidatos (cifras, zonas, características), normaliza con decimal.js, filtra, ordena, calcula, redacta con plantillas y escribe en la base de datos | Inventar un dato que no esté en una evidencia |
| **Usuario** | Confirma visitas, contactos y alertas; corrige la ficha de búsqueda con chips | — |
| **Equipo** | Revisa campos dudosos, corrige (la corrección manual siempre gana) y edita el catálogo | — |

## 2. Vista general

```
                    ┌───────────────────────────── Next.js 16 (App Router, RSC) ─────────────────────────────┐
 Navegador ───────► │ proxy.ts: rutas localizadas (es sin prefijo, /en/…) + refresco de sesión en cuenta/admin │
                    │                                                                                          │
                    │  Portal público (SSG + revalidación)   Asistente (fase 3-4)       Backoffice (roles)      │
                    │  app/[lang]/…                          /api/asistente (SSE)        app/[lang]/admin       │
                    │                │                                │                         │               │
                    │                ▼                                ▼                         ▼               │
                    │   src/i18n · src/ui · src/legal     src/asistente · src/gates     src/catalog (runtime)   │
                    │                                               │                                          │
                    │                                  ┌────────────┴────────────┐                             │
                    │                                  ▼                         ▼                             │
                    │                          src/jev (JevPort)          src/lib/supabase (JWT + RLS)          │
                    └──────────────────────────────────┼─────────────────────────┼─────────────────────────────┘
                                                       │                         │
                             TypeSafe API / Vercel AI Gateway          Supabase: Postgres + PostGIS, Auth, Storage
                                                                                 │
             Trabajos en segundo plano (fase 1): cola `jobs` ── ingesta del feed → evidencias → cascada SDE → canónico
             Plano de control: Google Sheets ──(npm run catalog:compile)──► catalog/compiled.json (versionado en git)
```

## 3. Estructura del repositorio

```
catalog/
  source/*.csv            Plano de control por defecto: Fields, Parallel_Packs, Adjudication_Rules
  compiled.json           Catálogo compilado y validado (lo único que lee el runtime)
docs/                     ARQUITECTURA, DECISIONES, CATALOGO_JEV (generado)
e2e/                      Playwright: recorridos y accesibilidad (axe, WCAG 2.2 AA)
eval/                     Marco de evaluación, suites, línea base y barrido de umbrales
scripts/                  catalog:compile, catalog:docs, test local de BD
src/
  app/                    Rutas (App Router). Todo lo visible cuelga de app/[lang]
  asistente/              Catálogo de preguntas del asistente (llamadas 1 y 2, valoración) y su versión
  catalog/                Esquema zod del plano de control, compilador, runtime y tipos generados
  config/                 Marca (único sitio con el nombre comercial), entorno (zod), secciones publicadas
  gates/                  Puertas, umbrales únicos y política de confianza por acción (4.3)
  i18n/                   Idiomas, rutas localizadas y diccionarios tipados
  jev/                    JevPort, cliente del SDK, FakeJev, caché, errores, auditoría de decisiones
  legal/                  Textos legales base (pendientes de revisión jurídica)
  lib/                    Supabase (servidor, proxy), seguridad (redirecciones)
  observability/          Logs estructurados con redacción de datos personales, métricas por etapa
  sde/                    Preguntas del pipeline SDE construidas desde el catálogo
  server/                 Runtime del servidor (config + métricas + Jev, una vez por proceso)
  ui/                     Sistema de diseño: tokens, componentes, cabecera, pie
  proxy.ts                Next 16: sustituye a middleware
supabase/
  migrations/             0001-0007, repetibles, RLS en todas las tablas
  tests/                  pgTAP: estructura, RLS por rol y agencia, reglas de negocio
  local/shim.sql          Solo para `npm run db:test:local` (Postgres sin Docker)
```

## 4. Jev

### 4.1 Puerto único

Nadie importa `@typesafe-ai/sdk` fuera de `src/jev/`. El resto del código habla con `JevPort`:

```ts
interface JevPort {
  readonly model: string;
  ask(request: { purpose; state; questions; catalogVersion; signal? }): Promise<JevResult>;
  health(): Promise<JevHealth>;
}
```

- `purpose` (`asistente.entender`, `asistente.juzgar`, `sde.<pack>`, `valoracion.comparables`, `eval`) sirve para métricas por uso, para la auditoría y para vigilar el límite de **2 llamadas por mensaje** en tiempo real.
- **Caché** LRU con TTL; clave = sha256 de `stableStringify({ model, catalogVersion, state, questions })`. Cambiar un texto del catálogo cambia la versión y, por tanto, invalida la caché.
- **Peticiones idénticas en vuelo** se comparten, salvo que lleven `AbortSignal` (cancelar una no debe cancelar la de otro).
- **Errores tipados**: `auth`, `invalid_request`, `rate_limited`, `timeout`, `unavailable` y `aborted` (cancelación del llamante; no cuenta como caída). `degradable` indica si se puede seguir sin Jev.
- **Métricas**: llamadas, aciertos de caché, tokens, coste estimado, errores por código y latencia p50/p95 por uso.
- **FakeJev** determinista: guion por llamada, `responder` con reglas y, sin guion, respuestas «vacías» (el caso degradado). Rechaza opciones que no existen, así los tests no pueden afirmar algo imposible.
- **Selección** (`src/config/env.ts`): `JEV_FAKE` > `TYPESAFE_API_KEY` > `AI_GATEWAY_API_KEY` > OIDC de Vercel > FakeJev.

### 4.2 Puertas y política

- `gateChoice`, `gateNoul` y `gateScore` convierten una respuesta en **actuar / confirmar / preguntar**.
- Cada umbral declara su **sentido**: `confianza` (choice/score), `si_bueno` (noul donde «sí» es lo deseado) y `si_malo` (alarmas como `inyeccion` y `ambiguo`). `loadThresholds` rechaza umbrales incoherentes.
- `POLITICAS` (sección 4.3): por acción, qué datos son requeridos, opcionales o irrelevantes, el riesgo y qué hacer ante la duda. `umbral()` aplica la relajación por evidencia literal (−0,15, nunca en riesgo alto ni en alarmas) y el suelo de 0,95 en riesgo alto.
- Cada decisión se registra con `decisionRecord` → tabla `jev_decisions`: pregunta, opciones, respuesta, valor elegido, puerta, resultado, versión del catálogo y modelo.

### 4.3 Dos catálogos versionados

| Catálogo | Fuente | Versión |
| --- | --- | --- |
| **Datos** (campos, paquetes, adjudicación) | Google Sheets o `catalog/source/*.csv` → `catalog/compiled.json` | `AAAA-MM-DD.<hash8>`; solo cambia si cambia el contenido |
| **Asistente** (llamadas 1 y 2, valoración) | `src/asistente/catalogo.ts` | Igual; un test falla si cambia el texto y no se sube la versión |

`npm run catalog:compile` valida (tipos, ids únicos, referencias entre pestañas, textos en inglés, claves en español, `{candidate}` en los numéricos, opciones reservadas), versiona, genera los tipos TypeScript y `docs/CATALOGO_JEV.md`, y ejecuta la evaluación. Si baja la precisión o aparece un dato inventado, falla. Con `--check` (CI) no escribe nada y falla si algo no está al día.

## 5. Pipeline de datos

```
Fuente (feed XML/JSON del CRM · alta manual · CSV)            ← adaptadores; los externos, solo con legal_ok
   │  hash de contenido: si no cambia, no se reprocesa
   ▼
Evidencias deterministas (listing_evidence)                   ← normalizadores con tests (precio, m², hab., planta…)
   │  source_weight: feed > JSON-LD > tabla de características > meta > texto
   ▼
Cascada SDE por paquetes en paralelo (una petición systemOne por paquete, concurrencia limitada)
   ├─ mini: valor estructurado sin contradicción → aceptado, sin Jev
   ├─ verify: noul «¿coincide {candidate} con el texto?»
   └─ reasoning: choice / score / noul sobre el texto libre
   │  conflicto fuera de tolerancia → <campo>__candidato + <campo>__motivo
   ▼
listing_fields (value, confidence, status, method, evidence_ids, catalog_version)
   ├─ por debajo del umbral del campo → review_queue
   └─ corrección manual → siempre gana (un trigger impide sobrescribirla)
```

| Pieza | Dónde |
| --- | --- |
| Adaptadores (XML de portales, CSV) con base legal e idempotencia por hash | `src/ingesta/` |
| Normalizadores (números, importes, superficies, estancias, planta, certificado, catastro, fechas, direcciones, características, proximidad) | `src/extraccion/` |
| Evidencias por campo desde feed, JSON-LD, meta, tabla y texto | `src/evidencia/` |
| Zonas (45 municipios + 65 barrios), búsqueda difusa y geocodificador | `src/zonas/`, migración 0008 |
| Cascada por paquetes, adjudicación, canónico y modo sin Jev | `src/sde/cascada/` |
| Pipeline por inmueble (publicación, slug, ubicación pública, distancias) | `src/pipeline/procesar.ts` |
| Persistencia transaccional (`sde_guardar`) y cola de trabajos por la API | migración 0009, `src/pipeline/almacen.ts` |
| Worker (`npm run worker`), ingesta (`npm run ingestar`) y POI (`npm run poi:importar`) | `scripts/` |
| 300 ficticios con verdad de referencia (`npm run ficticios`) | `src/ficticios/` |

Reglas que garantizan «nunca se inventa» (D-120 a D-124): el «no» de Jev sin evidencia negativa es `no_consta`; los ordinales exigen «¿consta?»; todo valor cita al menos una evidencia (lo valida el esquema zod del canónico); los enumerados incompatibles con la fuente estructurada nunca se confirman solos.

## 6. Asistente *(fases 3-4)*

Flujo por mensaje, con un máximo de **2 llamadas a Jev**:

```
mensaje + contexto ─► [código] extraer ─► Jev 1 (entender) ─► [código] ficha de búsqueda (chips)
  ─► [código] filtro duro + tolerancia + relajación ─► top 10-15 (se muestran ya, streaming)
  ─► Jev 2 (encaje; solo con criterios subjetivos) ─► [código] reordenar con pesos + «por qué» con plantillas
```

Etapas medidas: `extraer`, `jev1`, `filtrar`, `jev2`, `render` (`StageTimer`). Objetivos: primeros resultados < 1 s y reordenación < 2,5 s.

## 7. Datos (Supabase)

| Migración | Contenido |
| --- | --- |
| 0001 | Extensiones (PostGIS, pg_trgm, unaccent, pgcrypto), agencias, agentes con rol (`admin`, `agente`, `editor`), perfiles, `app.es_miembro()`, `mis_membresias()`, auditoría genérica |
| 0002 | Zonas (municipio > distrito > barrio, alias, geometría, colindancias), contenido SEO por agencia, POI, `buscar_zonas()` difusa |
| 0003 | Inmuebles, datos privados aparte, evidencias, campos canónicos, medios, historial de precio (trigger), traducciones, distancias a POI |
| 0004 | Fuentes de datos con base legal obligatoria, comparables (oferta frente a cierre), valoraciones |
| 0005 | Favoritos, búsquedas, alertas (doble opt-in), conversaciones y mensajes (retención), ficha de búsqueda, decisiones de Jev, consentimientos inmutables |
| 0006 | Leads (sin consentimiento no hay contacto), franjas, visitas, tareas, notas |
| 0007 | Cola de revisión, etiquetas de evaluación, versiones del catálogo, cola de trabajos |

Reglas: `agency_id` en todas las tablas de negocio; **RLS en todas las tablas** (un test lo comprueba); funciones auxiliares `SECURITY DEFINER` con `search_path` vacío; permisos de tabla explícitos (RLS decide las filas); migraciones repetibles.

Qué ve cada rol:

| | anon (portal) | usuario con cuenta | editor | agente | admin |
| --- | --- | --- | --- | --- | --- |
| Inmuebles publicados/reservados | ✓ | ✓ | ✓ | ✓ | ✓ |
| Borradores de su agencia | — | — | ✓ | ✓ | ✓ |
| Campos no públicos, evidencias | — | — | ✓ | ✓ | ✓ |
| Datos privados (propietario, comisión, notas) | — | — | — | ✓ | ✓ |
| Leads, visitas, tareas | — | los suyos | — | ✓ | ✓ |
| Conversaciones y decisiones de Jev | — | las suyas | — | — | ✓ |
| Auditoría | — | — | — | — | ✓ |
| Cola de trabajos | — | — | — | — | — (solo service_role) |

## 8. Portal, i18n y diseño

- **Rutas**: español sin prefijo (`/venta/murcia/centro/…`), inglés con `/en` y segmentos traducidos (`/en/sale/…`). El proxy reescribe a `app/[lang]/…` y redirige con 308 a la URL canónica si llega `/es/…` o un segmento de otro idioma. Añadir `de`, `fr` o `nl` = código + diccionario traducido por personas + segmentos.
- **Diccionarios tipados**: el inglés debe tener la misma forma que el español (lo comprueba el typecheck) y las mismas variables (lo comprueba un test).
- **SEO**: SSG con `generateStaticParams`, `hreflang` con `x-default`, canónicas, sitemap por idioma. No se indexa hasta que haya contenido real (`NEXT_PUBLIC_INDEXABLE`).
- **Sistema de diseño**: tokens CSS (neutros cálidos, estados, tipografía, espaciado, radios, sombras y movimiento) con modo claro, oscuro y automático sin parpadeo. La marca inyecta `--marca` y `--acento`, y el color del texto sobre ellos se elige por contraste WCAG.
- **Accesibilidad**: enlace para saltar al contenido, foco visible, objetivos táctiles de 44 px, estados de confianza con texto e icono (nunca solo color), `prefers-reduced-motion`, axe WCAG 2.2 AA en CI en ambos temas y comprobación de que no hay scroll horizontal a 360 px.
- **Navegación honesta**: solo se enlaza a secciones publicadas (`SECCIONES_PUBLICADAS`).

## 9. Seguridad y privacidad

- JWT del usuario + RLS en todas las lecturas y escrituras del portal y del backoffice. La `service_role` queda limitada a trabajos en segundo plano y a RPC públicas acotadas (fases 1 y 5).
- El `state` de Jev nunca lleva teléfono ni email. Los logs pasan por `redact()`.
- Magic link sin enumeración de cuentas; redirecciones solo internas (`destinoSeguro`); cierre de sesión solo por POST.
- Cabeceras: `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`. `/api/salud` solo comprueba Jev con el token de métricas (comparación en tiempo constante).
- Límites de frecuencia por IP y sesión y detección de inyección: fase 3, con el asistente.

## 10. Calidad

| Comando | Qué comprueba |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint (Next) y TypeScript estricto (`noUncheckedIndexedAccess`) |
| `npm test` | Vitest: config, marca, i18n, puertas, política, Jev (SDK real con transporte simulado), catálogo, contraste, barrido |
| `npm run catalog:compile -- --check` | Catálogo, tipos y documentación al día y evaluación sin retroceso |
| `npm run eval` | Suites sin Jev contra `eval/baseline.json` (datos inventados = 0) |
| `npm run e2e` | Playwright en móvil y escritorio + axe (WCAG 2.2 AA) en claro y oscuro |
| `npm run db:test:local` / `npm run db:test` | Migraciones (dos veces, para comprobar que se pueden repetir) + pgTAP |
| `npm run eval:jev` + `npm run eval:sweep` | Con Jev real (workflow manual o semanal) |

## 11. Despliegue *(pendiente de configurar)*

Vercel para la aplicación (Jev por AI Gateway con OIDC, sin claves guardadas) y Supabase gestionado (Postgres 17 con PostGIS). Los trabajos en segundo plano, con Vercel Cron o Supabase Cron llamando a un endpoint protegido que reserva lotes de `jobs`. El modelo de valoración (fase 6), como servicio Python aparte o proceso por lotes.
