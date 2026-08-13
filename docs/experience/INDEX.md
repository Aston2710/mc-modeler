# Incidentes

Ordenado por ID descendente. `mitigado` no es `resuelto`.

| ID | Incidente | Estado | Severidad | Componentes | Detectado |
|---|---|---|---|---|---|
| [EXP-016](016-el-historial-de-migraciones-no-reproduce-la-base.md) | El historial de migraciones no reproducía la base: faltaban 6 archivos de 35 migraciones aplicadas | resuelto | alta | `supabase/migrations`, `comment_threads`, MCP `apply_migration` | 2026-08-13 |
| [EXP-015](015-revoke-update-de-columna-es-noop-con-grant-de-tabla.md) | `REVOKE UPDATE (columna)` no surtió efecto porque existía un `GRANT UPDATE` de tabla | resuelto | alta | migraciones `0023`/`0028` | 2026-08-10 |
| [EXP-014](014-rls-evaluado-por-fila-degradaba-la-lista-de-diagramas.md) | La política RLS de `diagrams` se evaluaba una vez por fila y la lista tardaba 31 ms | resuelto | alta | `private.can_access_diagram`, `diagrams_select` | 2026-08-09 |
| [EXP-013](013-tabla-de-respaldo-expuesta-publicamente.md) | Una tabla de respaldo quedó en `public` con RLS desactivado y permisos para `anon` | resuelto | crítica | `_xml_backup_20260723`, PostgREST | 2026-08-09 |
| [EXP-012](012-ficheros-huerfanos-en-storage-tras-borrado.md) | Los thumbnails sobreviven al borrado de su diagrama y quedan inalcanzables | **activo** | media | `SupabaseRepository.ts`, `storage.objects` | 2026-08-09 |
| [EXP-011](011-perdida-silenciosa-de-cambios-entre-colaboradores.md) | **Dos personas editan el mismo diagrama y los cambios de una no llegan a la otra** | **activo** | **crítica** | `useCollab.ts`, `canvasSession.ts`, `diagramStore.ts` | 2026-08-10 |
| [EXP-010](010-mover-contenedor-reruta-las-flechas-internas.md) | Mover un pool, carril o grupo rerutaba las flechas internas | resuelto | alta | `src/bpmn/connections` | 2026-07-27 |
| [EXP-009](009-imagenes-de-la-biblioteca-no-visibles-para-colaboradores.md) | Las imágenes de la biblioteca no eran visibles para otros usuarios | resuelto | media | `images` RLS, `SupabaseImageRepository.ts` | 2026-08-04 |
| [EXP-008](008-diagrama-corrupto-diagnostico-y-mejora-continua.md) | Diagrama corrupto en producción: diagnóstico y mejora continua | resuelto | crítica | `src/persistence`, `current_xml` | 2026-07-23 |
| [EXP-007](007-flechas-duplicadas-por-divergencia-de-id-de-conexion.md) | Flechas duplicadas por divergencia del id de conexión entre clientes | resuelto | alta | `YjsBpmnBinding.ts`, `yBpmnModel.ts` | por-determinar |
| [EXP-006](006-export-bpm-desbordaba-int32.md) | La exportación a `.bpm` desbordaba enteros de 32 bits | resuelto | media | `src/utils/bpmExport.ts` | 2026-07-07 |
| [EXP-005](005-veneno-de-overlay-de-pool-en-el-doc-yjs.md) | Un overlay de pool corrupto quedaba persistido en el documento Yjs | resuelto | crítica | `YjsBpmnBinding.ts`, `createShape` | 2026-07-02 |
| [EXP-004](004-retroceso-de-estado-persistido-en-yjs.md) | El estado persistido de Yjs retrocedía a versiones anteriores | resuelto | crítica | `yjsPersistence.ts` (eliminado) | 2026-07-01 |
| [EXP-003](003-contaminacion-de-pools-entre-diagramas.md) | Elementos de un diagrama aparecían dentro del pool de otro | resuelto | crítica | `canvasSession.ts`, `useCollab.ts` | 2026-07-01 |
| [EXP-002](002-pool-fantasma-al-importar-desde-bizagi.md) | La importación de XML de Bizagi generaba un pool fantasma | resuelto | media | `src/bpmn/import` | 2026-06-28 |
| [EXP-001](001-escritura-cancelada-al-teclear-en-colaboracion.md) | Al teclear una etiqueta en modo colaborativo la edición se cancelaba sola | resuelto | alta | `YjsBpmnBinding.ts` | 2026-06-26 |

## Incidentes activos

Dos abiertos: EXP-011 y EXP-012. **EXP-011 es el único que destruye trabajo del usuario** y su mitigación es [PLAN-014](../plans/todo/014-mitigacion-perdida-de-trabajo-en-colaboracion.md), la prioridad máxima antes de producción.

## Los cinco incidentes de la auditoría 2026-08

EXP-011 a EXP-015 salieron de la misma auditoría. **Son problemas preexistentes encontrados leyendo el código y los datos**, no regresiones de las migraciones `0021`–`0029`. La excepción es EXP-015, que documenta una desviación *durante* la ejecución de PLAN-010.

Tres quedaron resueltos por esas migraciones (013, 014, 015); dos siguen abiertos porque requieren cambios en el cliente (011, 012).

EXP-010 se documentó como `activo` porque en la rama de la auditoría el fix no existía: llegó a `main` trece minutos después de crearse esa rama. Quedó `resuelto` al mezclar, el 2026-08-12.

**Los tres resueltos comparten el mismo riesgo de recaída: su corrección parece innecesaria.** El predicado conjuntista de EXP-014 duplica lógica; el `GRANT` columna a columna de EXP-015 parece complicación gratuita; y una tabla de respaldo en `public` seguirá pareciendo inofensiva. Sus secciones de *Prevención* existen sobre todo para quien vaya a "simplificar".

## Pendiente de completar

El front-matter se generó al reorganizar (2026-08-10) a partir de los encabezados existentes. Los campos marcados `por-determinar` necesitan revisión de quien vivió el incidente: fechas de detección y cierre en EXP-007, y la verificación explícita en los incidentes que no la documentaron.
