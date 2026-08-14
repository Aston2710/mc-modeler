# Planes cerrados

Orden por ID descendente. El `NNN` y el slug se conservan al cerrar para no romper enlaces.

| ID | Plan | Resultado | Cerrado |
|---|---|---|---|
| [PLAN-015](015-servidor-autoritativo-de-colaboracion.md) | Servidor autoritativo de colaboración (CRDT) | **descartado** — superado por [MASTER-PLAN-019](../todo/019-master-plan-servidor-autoritativo-de-colaboracion.md), que lo descompone en 7 fases. Su análisis del problema se conservó y amplió allí | 2026-08-11 |
| [PLAN-014](014-mitigacion-perdida-de-trabajo-en-colaboracion.md) | Mitigación de la pérdida silenciosa de trabajo en colaboración · *agrupado en MASTER-PLAN-018* | Mecanismos A y B de EXP-011 mitigados: las ediciones previas a conocer el rol se encolan en vez de descartarse, y agotar la espera del canvas deja de ser definitivo. Registro estructurado en `utils/incidents.ts`, precursor de PLAN-013. **No arregla la causa: EXP-011 sigue activo** | 2026-08-14 |
| [PLAN-010](010-auditoria-y-remediacion-de-base-de-datos.md) | Auditoría de la base Supabase y remediación aplicada · *agrupado en MASTER-PLAN-018* | 9 migraciones (`0021`–`0029`). Lista de diagramas 31.2 → 1.33 ms. Fuga P0 cerrada. Lo que requiere cliente quedó en PLAN-011, PLAN-012 y PLAN-016 | 2026-08-10 |
| [PLAN-009](009-soft-delete-y-papelera.md) | Soft delete y papelera de diagramas y proyectos | Implementado. Migración `0019` aplicada en producción | 2026-07-29 |
| [PLAN-008](008-refactor-ux-ui-cromo-de-la-aplicacion.md) | Refactor UX/UI del cromo de la aplicación | Implementado. El modelado BPMN no se tocó, según la regla #1 del plan | 2026-08-09 |
| [PLAN-007](007-propuesta-ux-ui.md) | Propuesta de rediseño UX/UI | Aprobada y ejecutada vía PLAN-008 | 2026-08-09 |
| [PLAN-006](006-limpieza-de-duplicados-y-cierre-del-pivote.md) | Limpieza de duplicados y cierre del pivote ADR | Etapa 6 completa: `yjs_documents`/`yjs_updates` eliminadas en producción (`0018`). Quedaron 3 duplicados diferidos | 2026-07-19 |
| [PLAN-004](004-modulo-de-notificaciones-por-correo.md) | Módulo de notificaciones por correo | Implementado: outbox + `pg_net` + Apps Script. **Pendiente el deploy del script** | 2026-07-08 |
| [PLAN-003](003-labels-externos-redimensionables.md) | Labels externos redimensionables con snap-to-content | Implementado y probado. Tipografía global/por-elemento pospuesta por decisión del usuario | 2026-07-07 |
| [PLAN-002](002-canvas-y-correccion-de-corrupcion.md) | Reestructuración del canvas y corrección de la corrupción | Implementado. Ver EXP-008 | 2026-07-23 |
| [PLAN-001](001-pivote-adr-xml-como-fuente-de-verdad.md) | Pivote ADR: XML canónico como única fuente de verdad | Etapas 0–6 implementadas. Pendientes: migración de imágenes base64 y UI de conflicto | 2026-07-19 |

## Nota sobre `aprobado_por`

El campo está en `por-determinar` en todos: estos planes se cerraron antes de que existiera esta estructura y la aprobación no quedó registrada. No se rellena inventando.

## Cierres con pendientes

PLAN-001 y PLAN-004 se cerraron con trabajo residual anotado en su `Resultado`. Eso es correcto —el plan cumplió su objetivo— pero si esos pendientes deben ejecutarse, necesitan su propio plan en `todo/`.
