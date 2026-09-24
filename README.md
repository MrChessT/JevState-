# Plataforma inmobiliaria con asistente dirigido por Jev

Portal, asistente, backoffice, pipeline de datos y valoración para una inmobiliaria de la Región de Murcia. El nombre comercial se configura en un solo sitio: `src/config/brand.ts`.

**Principio:** Jev decide y juzga (solo preguntas cerradas: `choice`, `noul`, `score`); el código extrae, calcula, busca y ejecuta; el usuario confirma lo que tiene consecuencias. Nunca se inventa un dato de un inmueble.

- [Arquitectura](docs/ARQUITECTURA.md)
- [Catálogo de preguntas a Jev y umbrales](docs/CATALOGO_JEV.md) (generado)
- [Decisiones](docs/DECISIONES.md), con las preguntas pendientes

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 0 · Base | Repo, CI, sistema de diseño, marca, i18n (es/en), auth con magic link, esquema con RLS, JevPort + FakeJev, puertas, umbrales, plano de control | **Hecha** |
| 1 · Datos | Ingesta, evidencias, normalizadores, cascada SDE, adjudicación, cola de revisión, geocodificación, POI, 300 inmuebles ficticios | Siguiente |
| 2 · Portal | Resultados con lista y mapa, ficha, zonas, favoritos, comparador, SEO | — |
| 3-4 · Asistente | Llamadas 1 y 2, ficha de búsqueda con chips, relajación, encaje, feedback, alertas | — |
| 5 · Conversión | Visitas y contacto con confirmación, CRM, emails, calendario | — |
| 6 · Valoración | Comparables + ajuste de Jev; modelo ML si supera la validación | — |
| 7 · Endurecimiento | Barrido de umbrales con Jev real, e2e completos, carga y seguridad | — |

## Desarrollo

```bash
npm install
cp .env.example .env.local   # sin claves funciona con el Jev simulado
npm run dev
```

## Calidad

```bash
npm run check                          # lint + tipos + tests + evaluación + build
npm run catalog:compile                # valida y compila el plano de control, versiona y regenera la documentación
npm run e2e                            # Playwright + axe (tras npm run build)
npm run db:test:local                  # migraciones + pgTAP en Postgres local (sin Docker)
npm run db:start && npm run db:test    # lo mismo con Supabase CLI
npm run eval:jev && npm run eval:sweep # con Jev real
```

La CI (`.github/workflows/ci.yml`) ejecuta en cada PR la aplicación, los e2e con accesibilidad y la base de datos. La evaluación con Jev real (`eval-jev.yml`) se lanza a mano o cada semana.
