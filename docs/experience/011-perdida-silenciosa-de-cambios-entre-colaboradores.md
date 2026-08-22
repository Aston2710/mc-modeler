---
id: EXP-011
titulo: Dos personas editan el mismo diagrama y los cambios de una no llegan a la otra
estado: activo
severidad: critica
fecha_deteccion: 2026-08-10
fecha_cierre:
componentes: [useCollab.ts, canvasSession.ts, diagramStore.ts, collabStore.ts]
relacionados: [PLAN-014, PLAN-015, PLAN-013, context/arquitectura-persistencia.md]
---

# Dos personas editan el mismo diagrama y los cambios de una no llegan a la otra

## Síntoma

Dos usuarios abren el mismo diagrama. **Ambos ven el avatar del otro en la barra de presencia y ven su cursor moverse por el lienzo.** Todo indica que están colaborando.

Pero las ediciones no se propagan: uno mueve una tarea y el otro no ve nada. Cuando ambos guardan, el trabajo de uno desaparece sin ningún aviso.

El único rastro es un `console.warn` que nadie mira.

## Impacto

**Pérdida de trabajo, silenciosa y no recuperable.** El usuario no sabe que perdió nada hasta que vuelve a abrir el diagrama y falta lo que hizo.

Agravante para una demostración comercial: abrir dos pestañas con el mismo diagrama es exactamente lo primero que alguien prueba al evaluar una herramienta colaborativa.

**No hay medición de con qué frecuencia ocurre.** Esa es precisamente la razón de PLAN-013.

## Reproducción

No hay reproducción determinista todavía — es dependiente de timing. Condiciones que la favorecen, por mecanismo:

**Mecanismo A — el binding nunca arranca.** Cambiar rápido entre varias pestañas de diagramas distintos justo al abrir uno compartido. Cuanto más lenta la red o más pesado el XML, más probable.

**Mecanismo B — la carrera con los roles.** Editar en el primer segundo tras abrir el diagrama, antes de que `loadRoles()` resuelva.

**Mecanismo C — el doble conflicto de CAS.** Requiere que A y B tengan vistas divergentes (normalmente consecuencia de A o B) y que ambos guarden.

## Causa raíz

Tres mecanismos independientes, un mismo síntoma. Los tres fallan **cerrado y en silencio**.

### A. El binding de Yjs no arranca y nadie se entera

`useCollab.ts:148-151`:

```ts
if (Date.now() - bindWaitStartedAt > BIND_CONFIRM_TIMEOUT_MS) {   // 10 s
  console.warn('[collab] el canvas nunca confirmó el diagrama', diagramId,
               '— colaboración deshabilitada para esta sesión')
  return
}
```

`isCanvasReadyFor(diagramId)` exige `readyDiagramId === diagramId && readyGeneration === generation`. Cada `beginImport()` incrementa `generation` y pone `readyDiagramId = null` (`canvasSession.ts:25-29`). Con multi-pestaña —que es central en la aplicación— una secuencia rápida de cambios puede dejar `generation` siempre por delante y la confirmación no llegar nunca.

**Por qué el usuario no lo percibe:** presencia y cursores viajan por el canal de Supabase, no por el binding. Siguen funcionando perfectamente. La señal visible dice "estamos colaborando" mientras el transporte de ediciones está muerto.

El fencing token es correcto y resuelve EXP-003; el problema no es el token, es que **agotar el plazo no avisa a nadie**.

### B. `canEdit` descarta ediciones en vez de encolarlas

`useCollab.ts:103`:

```ts
if (!useCollabStore.getState().canEdit(diagramId)) return
```

`loadRoles()` es asíncrono (`collabStore.ts:45`). Si el usuario edita antes de que resuelva, `canEdit` devuelve `false` y **el update se descarta del broadcast**. No se encola ni se reintenta.

La comprobación en sí es correcta y necesaria —cierra la fuga del viewer de solo lectura, ver `readonly viewer enforcement`—. El defecto es que su estado inicial indistinguible de "no puedes editar" provoca descarte permanente de esos deltas.

### C. El doble conflicto de CAS acepta el estado ajeno

`diagramStore.saveDiagram`: ante un conflicto de CAS re-sincroniza y reintenta una vez; si vuelve a chocar, **acepta el estado del otro** y refresca la versión local.

Está documentado como decisión consciente en `context/arquitectura-persistencia.md` §6:

> el modelo aplicado es "último-gana con reintento" (buen uso, tiempo real). La **confirmación explícita de conflicto en UI** (vista muy stale / edición offline larga = mal uso) queda **diferida**.

El supuesto que la sostiene es: *"con tiempo real, todos escriben casi el mismo estado acordado"* (§3.3). **Ese supuesto se rompe cuando A o B fallan**: si las ediciones no se propagaron, las vistas no son "casi idénticas", son divergentes — y entonces "último gana" deja de ser seguro y pasa a ser pérdida de datos.

Los tres mecanismos se componen: A o B producen la divergencia, C la consuma.

## Solución planteada

Dos niveles, deliberadamente separados.

**Mitigación (PLAN-014, antes de producción).** No arregla la causa, hace imposible la pérdida silenciosa:
- que el agotamiento del plazo de A deje de ser solo un `console.warn`
- que B encole en vez de descartar mientras `loadRoles()` no haya resuelto
- que C pregunte al usuario en vez de decidir por él — es el pendiente #5 del ADR

**Solución estructural (PLAN-015, diferida).** Servidor autoritativo de CRDT: un documento por diagrama con estado real, del que el late-joiner recibe la verdad en vez de la suposición de un peer, y que además escribe `current_xml` — lo que elimina la carrera de CAS porque pasa a haber un solo escritor.

Es la decisión #7 del ADR, diferida desde el 2026-07-02 (DEC-004). No se adelanta sin datos: PLAN-013 existe para producirlos.

## Solución realizada

**Mitigación completa el 2026-08-14** ([PLAN-014](../plans/done/014-mitigacion-perdida-de-trabajo-en-colaboracion.md)). Los tres mecanismos dejan de ser silenciosos:

| | Antes | Ahora |
|---|---|---|
| **A** · plazo del canvas agotado | `console.warn` y se rendía **toda la sesión**, con presencia y cursores vivos → los dos usuarios se creían sincronizados | se sigue sondeando cada 2 s (`collab/bindingLifecycle.ts`); un canvas que confirma tarde arranca igual. Queda registrado con `waited_ms`, `retries` y `ready_diagram` |
| **B** · carrera de `canEdit` | el delta se descartaba para siempre | se encola hasta saber el rol (`collab/pendingEdits.ts`); editor → se envía, lector → se descarta. La propiedad de solo-lectura sigue fijada por pruebas |
| **C** · doble conflicto de CAS | resolvía solo, adoptando el estado ajeno | pregunta al usuario (ya estaba implementado, descubierto el 2026-08-11) |

Más `src/utils/incidents.ts`: registro estructurado con catálogo cerrado, inspeccionable con `__flujoIncidents.table()`.

## Estado: sigue ACTIVO

La mitigación reduce el daño; **la causa del mecanismo A sigue sin identificar**. Durante la auditoría de PLAN-005 se planteó que el fencing de `canvasSession` fallara con varias instancias vivas, pero **se verificó y es falso** (`useBpmnModeler.ts:299-308` reclama y confirma la generación de forma síncrona al re-adjuntar).

El registro añadido es lo que producirá el dato. Mientras tanto, la solución de fondo sigue siendo [MASTER-PLAN-019](../plans/todo/019-master-plan-servidor-autoritativo-de-colaboracion.md).

## Verificación

Pendiente. El criterio será: provocar cada mecanismo en un entorno controlado y comprobar que ninguno puede descartar trabajo sin que quede constancia visible o registrada.

## Prevención

- **Señal de recaída:** `console.warn` con el texto `el canvas nunca confirmó el diagrama`. Hoy es el único indicio y no se vigila.
- **Regla derivada:** ninguna ruta que pueda descartar una edición del usuario debe hacerlo sin dejar registro. Un `return` silencioso dentro de un gate de permisos o de un plazo agotado es sospechoso por definición.
- **No confundir presencia con sincronía.** Que se vean avatares y cursores no prueba que las ediciones viajen: van por caminos distintos. Cualquier indicador de "colaborando" debe leer el estado del binding, no el del canal.
- **Antecedente:** EXP-003 y EXP-005 nacieron de la misma zona. El fencing token que los resolvió es correcto; lo que faltó fue tratar su plazo agotado como un fallo reportable.
