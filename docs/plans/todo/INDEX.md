# Planes pendientes

## Prioridad 0 — incidente de producción con pérdida de trabajo

| ID | Plan | Estado |
|---|---|---|
| [PLAN-035](035-copiar-pegar-y-guardado-resiliente.md) | **El guardado no pierde trabajo** — saneo del árbol y copiar/pegar robusto | **en-progreso** — nace de [EXP-022](../../experience/022-una-pieza-mal-formada-cancela-el-guardado-entero.md) el 2026-09-02. **Capas A y C implementadas, probadas y commiteadas** (417 pruebas, lint y `tsc` limpios, sin cambios de BD, rama `plan-035-copiar-pegar-y-guardado-resiliente`); quedan la verificación manual del pegado con imagen vinculada y decidir si la capa B merece escribirse |
| [PLAN-036](036-borrador-local-de-trabajo-no-guardado.md) | **Borrador local del trabajo no guardado** — que un cierre o un cuelgue no cuesten horas | todo — la capa D de PLAN-035, con plan propio. Diseño cerrado (tres carriles, comprobación de ancestro, reutiliza la UI de conflicto existente); **bloqueado por 5 decisiones abiertas** (A retención · B dos pestañas · C modo local · D cuota · E solo lectura) |

Van por delante de PLAN-034 porque hubo pérdida de trabajo real en producción. No compiten con él: no comparten ningún archivo.

**PLAN-036 es el que cierra el hueco de fondo**, no PLAN-035. Aquel evita que un defecto del árbol cueste el guardado; este evita que *cualquier* cosa —red, cierre, cuelgue, choque de CAS— cueste el trabajo. Hoy, con Supabase configurado, el repositorio de IndexedDB **no se instancia nunca**: no hay ninguna copia local de lo no guardado.

## Prioridad 1

| ID | Plan | Estado |
|---|---|---|
| [PLAN-034](034-vista-documento-y-cajetin-configurable.md) | **Vista Documento: cabecera de documento ISO 7200 y exportación a la medida de la hoja** | en curso — **prioridad 1**, es el único plan con compromiso externo. **Fases 0–6 implementadas y probadas en el laboratorio**; la cabecera se llama como la nombra **ISO 7200**; falta aplicar la migración a producción, cerrar [EXP-021](../../experience/021-la-cabecera-en-el-lienzo-se-solapa-con-el-diagrama.md), el visto bueno visual y la aprobación de cierre |

Nace de la reunión con el equipo de procesos de la empresa. Va por delante de los tres master plans por decisión del usuario (2026-08-22). Lleva su medición hecha: 177 diagramas de producción y 235 SVG exportados, más la geometría real del estándar leída del `.docx`.

Colisión que hay que resolver antes de construir: su capa de personalización es **la misma familia de decisión** que la D5 de [MASTER-PLAN-027](027-master-plan-modulo-diagramas-de-arquitectura.md). Debería decidirse una vez.

---

Tres master plans activos. **Abre el que corresponda al frente:**

| Master plan | Qué abarca | Progreso |
|---|---|---|
| [MASTER-PLAN-018](018-master-plan-auditoria-y-frentes-abiertos.md) | Auditoría 2026-08: base de datos, rendimiento y colaboración — **corrige lo que existe** | 2/7 |
| [MASTER-PLAN-019](019-master-plan-servidor-autoritativo-de-colaboracion.md) | Servidor autoritativo — **cambio de infraestructura** | 0/7 |
| [MASTER-PLAN-027](027-master-plan-modulo-diagramas-de-arquitectura.md) | Módulo de diagramas de arquitectura — **expansión de producto** | 0/6 |

Orden por ID descendente. **El número es orden de descubrimiento, no de ejecución** (ver [`docs/README.md`](../../README.md)).

## MASTER-PLAN-027 · Módulo de diagramas de arquitectura

| ID | Plan | Fase | Estado |
|---|---|---|---|
| PLAN-033 | Plantillas de patrones | 5 | por redactar |
| PLAN-032 | Drill-down, apariencia y export | 4 | por redactar |
| PLAN-031 | Espacios y home | 3 | por redactar |
| PLAN-030 | Paleta y gestos | 2 | por redactar |
| PLAN-029 | Metamodelo y motor sobre diagram-js | 1 | por redactar |
| PLAN-028 | Contrato y registro de módulos + refactor de desacople | 0 · **única fase que toca código BPMN** | por redactar |

Los seis sub-planes se redactan al arrancar cada fase, por decisión del propio master plan: no congelar detalle que la fase anterior puede desmentir. **Los documentos no existen todavía; el ID está reservado.**

Dos cosas de este master plan siguen abiertas y son suyas, no de sus fases:

- **`aprobado_por` está vacío.** Sus decisiones D1–D7 constan como *acordado* en el documento pero **no están registradas como `DEC-NNN`** en [`context/decisiones.md`](../../context/decisiones.md), porque el propio plan dice que eso se hace *al aprobar*. Hasta entonces son acuerdos de sesión, no decisiones del proyecto.
- **D4 (segmentación) está marcado para replantear** por el plan mismo, y **C4 sin detallar** — pendiente de una sesión aparte antes de congelar el metamodelo.

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

Orden vigente **por tandas** desde el 2026-08-21 (la unidad es un ciclo de laboratorio, no una fase):

| Tanda | ID | Plan | Frente | Estado |
|:-:|---|---|---|---|
| **1** | [PLAN-012](012-thumbnails-webp-y-entrega-segura.md) | Thumbnails a WebP con entrega segura | rendimiento | **en-progreso** — implementado sin commitear; falta ejecutar el backfill. Ver su *Estado de ejecución* |
| **2** | [PLAN-011](011-remediacion-de-base-de-datos-pendiente.md) | Deuda de esquema pendiente | base de datos | todo — va con PLAN-017 en una sola migración |
| **2** | [PLAN-017](017-higiene-de-datos-y-retencion.md) | Higiene de datos y retención · **dueño del barrido de huérfanos** | base de datos | todo — 3 decisiones de producto |
| **3** | [PLAN-013](013-cola-de-incidentes-auditable.md) | Cola de incidentes auditable | observabilidad | todo — **5 decisiones abiertas**; `utils/incidents.ts` ya tiene su superficie |
| — | [PLAN-016](016-podar-la-publicacion-de-realtime.md) | Podar la publicación de Realtime (73 % del CPU) | rendimiento | todo — el cliente debe migrarse a Broadcast antes |

## Sin agrupar

| ID | Plan | Estado |
|---|---|---|
| [PLAN-037](037-navegador-de-diagramas-del-editor-por-proyecto.md) | **El navegador de diagramas del editor muestra el proyecto, no la cuenta entera** — y hace scroll | **en-progreso** — dos defectos de cliente, sin BD: el modal del botón de carpeta nunca filtró por proyecto, y en cuadrícula **comprimía las filas a 14,9 px en vez de desbordar** (el arreglo ya existía en el home, `index.css:1705`). **Implementado y verificado en modo local con 47 diagramas sembrados, sin commitear** (427 pruebas, lint y `tsc` limpios). Falta el visto bueno visual, verificar `.ig-grid` con la biblioteca llena, y la aprobación de cierre |
| [PLAN-005](005-cambio-de-pestanas-con-instancia-viva.md) | Cambio de pestañas con instancia bpmn-js viva | **en-progreso** — ya en producción con el flag ON; auditado 2026-08-14. Le quedan dos puntos (`canvasSession`/`readOnlyState` por instancia, y sacar `persistCanvasTab` del cambio de pestaña) |

## PLAN-013 bloquea los dos master plans de corrección e infraestructura

Sus cinco decisiones abiertas —qué significa "auditable", retención (`pg_cron` no instalado), quién lee, crashes de JS, indicador de estado— son el cuello de botella real del proyecto:

- sin datos, **PLAN-020 no puede decidir** si la infraestructura se construye
- y sin esa decisión, MASTER-PLAN-019 entero está parado

**MASTER-PLAN-027 no está bloqueado por PLAN-013.** Sí comparte archivos con MASTER-PLAN-019 (`diagramStore.ts`, `App.tsx`, `BpmnCanvas.tsx`, `useCollab.ts`), y por eso su fase 0 deja el binding CRDT como punto de extensión sin implementar.

## Bloqueos

| Plan | Bloqueado por |
|---|---|
| **cerrar** EXP-022 | el registro de PLAN-013. Hoy `save.model_repaired` solo llega a la consola del navegador, así que no hay forma de saber si la causa raíz sigue viva |
| PLAN-036 | 5 decisiones abiertas (retención, dos pestañas, modo local, cuota, solo lectura). El diseño ya está cerrado; falta decidir, no investigar |
| PLAN-020 y todo MASTER-PLAN-019 | los datos de PLAN-013 |
| PLAN-013 | 5 decisiones de producto |
| PLAN-016 | migrar el cliente a Broadcast; aplicar el SQL antes causa regresión silenciosa |
| PLAN-017 | 3 decisiones de producto |
| PLAN-011 | depende de PLAN-012 para no tocar dos veces los mismos 6 sitios |
| PLAN-012 | nada: aplicado en producción el 2026-08-22. Falta el visto bueno visual y la aprobación de cierre |
| MASTER-PLAN-027 fase 0 | aprobación del master plan (`aprobado_por` vacío), el detalle de C4, y replantear D4 antes de tocar el esquema |
| PLAN-034 | la migración `20260823000000_projects_doc_template` está **aplicada y verificada solo en el laboratorio** (10/10, incluida la comprobación como usuario real). Producción necesita aprobación explícita |
| **cerrar** PLAN-034 | [EXP-021](../../experience/021-la-cabecera-en-el-lienzo-se-solapa-con-el-diagrama.md) — la cabecera en el lienzo solapa el diagrama y el PDF no. Bloquea su criterio de aceptación 8. **No bloquea el despliegue**: el arreglo está diseñado y escrito, y se aplazó a propósito el 2026-09-01 |

## Al cerrar un plan agrupado

Además de moverlo a `done/`, hay que marcar su casilla en el master plan correspondiente y actualizar `progreso`. Procedimiento en [`docs/README.md`](../../README.md#master-plans).
