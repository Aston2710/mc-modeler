# Planes pendientes

Dos master plans activos. **Abre el que corresponda al frente:**

| Master plan | Qué abarca | Progreso |
|---|---|---|
| [MASTER-PLAN-018](018-master-plan-auditoria-y-frentes-abiertos.md) | Auditoría 2026-08: base de datos, rendimiento y colaboración — **corrige lo que existe** | 1/7 |
| [MASTER-PLAN-019](019-master-plan-servidor-autoritativo-de-colaboracion.md) | Servidor autoritativo — **cambio de infraestructura** | 0/7 |

Orden por ID descendente. **El número es orden de descubrimiento, no de ejecución** (ver [`docs/README.md`](../../README.md)).

## MASTER-PLAN-019 · Servidor autoritativo

| ID | Plan | Fase | Estado |
|---|---|---|---|
| [PLAN-026](026-historial-de-operaciones.md) | Historial de operaciones | 6 · opcional | todo |
| [PLAN-025](025-corte-progresivo-y-retirada-del-transporte-antiguo.md) | Corte progresivo y retirada del transporte antiguo | 5 · **último punto de retorno** | todo |
| [PLAN-024](024-persistencia-autoritativa.md) | El servidor pasa a ser el único escritor de `current_xml` | 4 | todo |
| [PLAN-023](023-validacion-de-integridad-referencial.md) | Validación de integridad referencial | 3 | todo |
| [PLAN-022](022-degradacion-y-reconexion.md) | Degradación y reconexión | 2 | todo |
| [PLAN-021](021-servicio-minimo-en-modo-sombra.md) | Servicio mínimo en modo sombra | 1 | todo |
| [PLAN-020](020-decision-y-eleccion-de-infraestructura.md) | Decisión y elección de infraestructura | 0 · **puerta** | todo — bloquea todo lo demás |

## MASTER-PLAN-018 · Auditoría 2026-08

| ID | Plan | Frente | Estado |
|---|---|---|---|
| [PLAN-017](017-higiene-de-datos-y-retencion.md) | Higiene de datos y políticas de retención | base de datos | todo — 3 decisiones de producto |
| [PLAN-016](016-podar-la-publicacion-de-realtime.md) | Podar la publicación de Realtime (73 % del CPU) | rendimiento | todo — el cliente debe migrarse antes |
| [PLAN-013](013-cola-de-incidentes-auditable.md) | Cola de incidentes auditable | observabilidad | todo — **5 decisiones abiertas**; `utils/incidents.ts` ya tiene su superficie |
| [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) | Thumbnails a WebP con entrega segura | rendimiento | todo |
| [PLAN-011](011-remediacion-de-base-de-datos-pendiente.md) | Deuda de esquema pendiente | base de datos | todo |

## Sin agrupar

| ID | Plan | Estado |
|---|---|---|
| [PLAN-005](005-cambio-de-pestanas-con-instancia-viva.md) | Cambio de pestañas con instancia bpmn-js viva | **en-progreso** — ya en producción con el flag ON; auditado 2026-08-14 |

## PLAN-013 bloquea los dos master plans

Sus cinco decisiones abiertas —qué significa "auditable", retención (`pg_cron` no instalado), quién lee, crashes de JS, indicador de estado— son el cuello de botella real del proyecto:

- sin datos, **PLAN-020 no puede decidir** si la infraestructura se construye
- y sin esa decisión, MASTER-PLAN-019 entero está parado

## Bloqueos

| Plan | Bloqueado por |
|---|---|
| PLAN-020 y todo MASTER-PLAN-019 | los datos de PLAN-013 |
| PLAN-013 | 5 decisiones de producto |
| PLAN-016 | migrar el cliente a Broadcast; aplicar el SQL antes causa regresión silenciosa |
| PLAN-017 | 3 decisiones de producto |
| PLAN-011 | depende de PLAN-012 para no tocar dos veces los mismos 6 sitios |

## Al cerrar un plan agrupado

Además de moverlo a `done/`, hay que marcar su casilla en el master plan correspondiente y actualizar `progreso`. Procedimiento en [`docs/README.md`](../../README.md#master-plans).
