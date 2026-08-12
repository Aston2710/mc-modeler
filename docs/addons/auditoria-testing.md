# Auditoría de testing

**Fecha:** 2026-07-19 · Capítulo 3 de la auditoría. Decisión resultante: D-13 en `auditoria-decisiones.md`.

---

## 1. Estado medido

| Métrica | Valor |
|---|---|
| Framework | Vitest + jsdom (+ @testing-library instalado pero sin uso en componentes) |
| Suites / casos | 19 archivos · 42 describe · **151 tests · todos verdes** |
| Duración | **11.3s** la suite completa — se puede correr en cada save |
| Volumen | 2.775 LOC de test vs ~23k de producción (~12%) |
| CI | **NO EXISTE** — ni GitHub Actions ni hook pre-push; `npm test` y `npm run lint` corren solo a voluntad |
| Cobertura medida | No configurada (sin `--coverage` ni reporter) |
| E2E / browser real | Ninguno |

### Inventario por dominio

| Dominio | Suites | Qué cubren |
|---|---|---|
| `collab/` | 9 (859 LOC) | Binding: guards, connid, move, multidoc, integración · drift de liveSync · protocolo de sync · transporte pivote · comment binding |
| `bpmn/` | 5 (1.196 LOC) | **Routing: integración 621 LOC + invariante ortogonal** · ReadOnly veto · labels redimensionables · imageLink |
| `store/` | 2 (226 LOC) | CAS (conflicto/reintento/doble/inválido/borrado) · readonly |
| `utils/` | 3 (276 LOC) | imageStorage · normalizeBpmnXml · migratePhotoDiagrams |
| `persistence/` `hooks/` `components/` `domain/` `lib/` | **0** | — |

## 2. Fortalezas (mantener)

1. **Cobertura dirigida por riesgo, no por métrica.** Cada suite existe porque hubo o pudo haber un bug real (los 9 de collab y el de CAS mapean 1:1 con fix_doc). Es la estrategia correcta — nunca cambiarla por "% de cobertura" como KPI.
2. **Tests de integración donde importa.** `routing.integration.test.ts` (621 LOC, jsdom) ejercita el router completo, no funciones sueltas — es lo que caza regresiones de comportamiento.
3. **Suite rápida (11s) y determinista.** Barata de correr siempre; no hay excusa de fricción.
4. **Mocking en la frontera correcta:** se mockea el cliente Supabase, no la lógica propia.

## 3. Huecos (por riesgo real, no por completismo)

1. **CI inexistente — el hueco #1.** Con suite de 11s y cero CI, cualquier push puede romper todo sin enterarse nadie hasta producción. Es el fix de mayor retorno de toda la auditoría de calidad: un workflow de GitHub Actions con `lint + vitest run + tsc -b` (~20 líneas de YAML).
2. **`persistence/` sin tests directos** — CAS se testea vía diagramStore con repo mockeado; los mapeos fila↔dominio, caché de thumbnails y `save` real de `SupabaseRepository` no tienen red.
3. **`useAutoSave` sin tests** — concentra los guards más delicados (viewer, canvas-ready, jitter, dirty). Testeable con timers falsos de Vitest.
4. **Roundtrip .bpm ausente** — `bpmExport`/`bpmImport` (1.7k LOC combinadas) sin test export→import→idéntico; el bug int32 de fix_doc habría caído aquí.
5. **Pruebas multiusuario reales pendientes** — el propio ADR las lista (§2d) y siguen sin existir. El drift test simula 2 docs en memoria; nadie prueba 2 navegadores reales contra Realtime. Candidato: smoke E2E con Playwright (2 contexts, editar → ver llegar el cambio) — **solo** el happy path colaborativo, no una pirámide E2E completa.
6. Cobertura no medida: activar `vitest --coverage` como **diagnóstico ocasional** (encontrar zonas ciegas), jamás como objetivo.

## 4. Plan (D-13)

| Prioridad | Acción | Costo |
|---|---|---|
| 1 | CI: GitHub Actions con `lint + tsc + vitest run` en push/PR | ~20 líneas YAML |
| 2 | Tests de `useAutoSave` (guards + jitter, fake timers) | corto |
| 3 | Tests de `SupabaseRepository` (mapeos, CAS, caché thumbnails, mock del cliente) | 1 sesión |
| 4 | Roundtrip .bpm (export→import→deep-equal) | corto |
| 5 | Smoke E2E colaborativo con Playwright (2 contexts) — cierra ADR §2d | 1-2 sesiones; requiere entorno Supabase de prueba |

**Anti-metas declaradas:** no perseguir % de cobertura; no testear componentes UI declarativos sin lógica; no construir pirámide E2E — un smoke basta mientras el equipo sea interno.
