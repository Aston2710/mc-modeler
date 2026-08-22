---
id: PLAN-014
titulo: Mitigacion pre-produccion de la perdida silenciosa de trabajo en colaboracion
estado: done
creado: 2026-08-10
cerrado: 2026-08-14
aprobado_por: jredondo
relacionados: [EXP-011, PLAN-013, MASTER-PLAN-018, PLAN-005, context/arquitectura-persistencia.md]
---

# Mitigación pre-producción de la pérdida silenciosa de trabajo en colaboración

> **Prioridad máxima.** Es el único plan que evita pérdida de datos, y el único cuyo escenario de fallo —dos pestañas con el mismo diagrama— es lo primero que alguien probará en una demostración.

## Objetivo

Que sea **imposible** que la aplicación descarte trabajo del usuario sin que quede constancia. No arregla la causa de EXP-011: convierte tres fallos silenciosos en tres situaciones visibles o registradas.

Al terminar, el peor caso deja de ser "perdí una hora de trabajo y no sé por qué" y pasa a ser "la aplicación me avisó y elegí qué conservar".

## Alcance

**Entra:** los tres mecanismos de EXP-011 (A: plazo del binding agotado; B: carrera de `canEdit`; C: doble conflicto de CAS). Cliente TypeScript exclusivamente.

**No entra:** el servidor autoritativo (PLAN-015), la cola de incidentes (PLAN-013), y cualquier cambio de esquema. Este plan no toca la base de datos.

**Frontera explícita sobre la UI:** hay una decisión de producto tomada de no mostrar errores en producción. Este plan la respeta con un matiz que hay que resolver antes de empezar: *mostrar estado* no es *mostrar un error*. Google Docs no muestra un error al perder conexión, muestra "Trabajando sin conexión". El mecanismo C **sí necesita** interacción del usuario —no hay forma de preguntar sin preguntar—; A y B pueden resolverse sin UI visible.

## Precondiciones

1. **Decidir el tratamiento de A.** Tres opciones, de menos a más visible:
   - solo registrar (requiere PLAN-013 operativo)
   - indicador de estado discreto tipo "colaboración no conectada", detrás de flag
   - reintento agresivo del binding sin avisar, y registrar solo si tampoco así arranca
2. **Confirmar el texto y las opciones del diálogo de C.** Es la única UI nueva obligatoria.
3. Decidir si este plan espera a PLAN-013 o si registra provisionalmente en `console` con un formato estructurado que luego se redirige.

## Pasos

### 1 · Mecanismo B — encolar en vez de descartar

El más barato y sin ninguna implicación de UI. `useCollab.ts:103`.

Estado actual: si `canEdit` es `false`, el delta se descarta para siempre.

Cambio: distinguir **"aún no sé"** de **"no puedes"**. Mientras `loadRoles()` no haya resuelto, acumular los deltas en un buffer acotado; al resolver, vaciarlo si el rol permite editar, descartarlo si no. Un viewer de solo lectura sigue sin emitir nada — la propiedad de seguridad de `readonly viewer enforcement` se conserva intacta.

Riesgo de regresión: bajo. La ventana es de milisegundos y el buffer se acota por tamaño.

### 2 · Mecanismo C — preguntar en vez de decidir

El que evita la pérdida real. Es el pendiente **#5 del propio ADR**, escrito el 2026-07-02 y nunca ejecutado.

Estado actual: al segundo conflicto de CAS, `diagramStore.saveDiagram` acepta el estado del otro y refresca la versión local. El trabajo local se pierde sin rastro.

Cambio: en el segundo conflicto, **no** resolver. Presentar al usuario:
- *Cargar la versión del servidor* — comportamiento actual, ahora consciente
- *Guardar mi copia como duplicado* — crea un diagrama nuevo con el trabajo local

El XML local ya está a salvo en memoria (`cacheXml`, `App.tsx:386`), así que la segunda opción no requiere infraestructura nueva.

**Este paso es el que hay que hacer aunque no se haga ningún otro.**

### 3 · Mecanismo A — que agotar el plazo sea un evento

`useCollab.ts:148`. Estado actual: `console.warn` y `return`.

Cambio mínimo: exponer el estado del binding (`activo` / `esperando` / `agotado`) desde `useCollab`, y registrar el agotamiento con contexto — `generation`, `readyGeneration`, milisegundos esperados, cambios de pestaña previos. Ese contexto es lo que permitirá confirmar o descartar la hipótesis del fencing (ver *Riesgos*).

Qué se hace con ese estado depende de la precondición 1.

### 4 · Verificación de los tres

Provocar cada mecanismo en un entorno controlado:
- **A:** encadenar cambios de pestaña con importación instrumentada lenta
- **B:** emitir una edición antes de que `loadRoles()` resuelva
- **C:** dos sesiones con vistas divergentes forzadas, ambas guardando

## Criterios de aceptación

- Ninguna ruta de `useCollab` descarta un delta del usuario sin registrarlo o encolarlo
- El doble conflicto de CAS nunca resuelve solo: siempre hay una elección del usuario
- El estado del binding es observable desde fuera del hook
- Un viewer de solo lectura sigue sin emitir nada al canal — verificar que no se abrió la fuga que cerró `readonly viewer enforcement`
- Los tres mecanismos reproducidos y comprobados, no solo razonados

## Riesgos

**El diálogo de C aparece con demasiada frecuencia.** Si el mecanismo A es más común de lo que creemos, C se disparará seguido y molestará. Mitigación: los pasos 1 y 3 reducen la causa antes de que C tenga que preguntar. Si aun así molesta, es señal de que hace falta PLAN-015, no de que sobre el diálogo.

**Encolar en B introduce deltas fuera de orden.** Mitigación: Yjs es un CRDT, sus operaciones son conmutativas por diseño. Aplicar un delta tarde converge igual. Este es precisamente el caso para el que sirve un CRDT.

**La hipótesis sobre A puede estar equivocada.** Creo que el fencing de `canvasSession` no confirma nunca en escenarios de multi-pestaña rápida, pero **no está probado** — es inferencia de lectura del código, no observación. El paso 3 produce los datos que la confirman o la refutan. Si resulta que A casi nunca ocurre, su prioridad baja y C sigue siendo obligatorio.

## Registro de ejecución

| Fecha | Qué | Resultado |
|---|---|---|
| 2026-08-11 | Paso 2 (mecanismo C) | Se descubrió **ya implementado**: `diagramStore.ts:349-355` y `App.tsx:271-315`. El doble conflicto de CAS pregunta en vez de decidir |
| 2026-08-14 | Precondición 1 resuelta | Decisión del usuario: **reintentar y registrar, sin aviso en la interfaz**. Se respeta la regla de no mostrar estado de colaboración en producción |
| 2026-08-14 | Precondición 3 resuelta | No se espera a PLAN-013: `src/utils/incidents.ts` registra en consola con la superficie que PLAN-013 necesitará, de modo que ese cambio tocará solo ese archivo |
| 2026-08-14 | Pasos 1, 3 y 4 | Implementados y verificados. 22 pruebas nuevas |
| 2026-08-14 | Verificación manual | El usuario ejerció los tres mecanismos en el entorno local (`npm run lab`, dos usuarios sembrados con roles distintos) |

## Resultado

**Cerrado el 2026-08-14.** Los tres mecanismos de EXP-011 dejan de ser silenciosos.

### Qué cambió

**Mecanismo B — encolar en vez de descartar.** `canEdit()` devolvía `false` tanto para "es lector" como para "todavía no sé quién es", y tratarlos igual descartaba para siempre las ediciones de los primeros milisegundos. Ahora `collabStore` expone `rolesLoaded`, y mientras no se sepa el rol las ediciones se acumulan en un buffer acotado (`src/collab/pendingEdits.ts`). Al resolver: editor → se envían en orden; lector → se descartan. Que aplicarlas tarde sea correcto no es casualidad: Yjs es un CRDT y sus operaciones son conmutativas.

**Mecanismo A — agotar el plazo es un evento, no un final.** Antes, si el canvas no confirmaba en 10 s, un `console.warn` y se rendía **para toda la sesión**, con presencia y cursores siguiendo vivos: los dos usuarios se veían y creían estar sincronizados. Ahora se sigue sondeando cada 2 s (`src/collab/bindingLifecycle.ts`), así que un canvas que confirma tarde arranca igual. La condición de arranque **no se relajó**.

**Mecanismo C** ya estaba resuelto antes de empezar.

**Registro estructurado** — `src/utils/incidents.ts`, hermano de `utils/perf.ts`. Catálogo cerrado de códigos, solo escalares en el detalle (ids, contadores, milisegundos: nunca XML ni etiquetas), nunca lanza. Inspección en consola con `__flujoIncidents.table()`.

### Criterios de aceptación

- ☑ Ninguna ruta de `useCollab` descarta un delta sin registrarlo o encolarlo
- ☑ El doble conflicto de CAS nunca resuelve solo
- ☑ El estado del binding es observable fuera del hook (`collabStore.bindingState`)
- ☑ Un lector sigue sin emitir nada al canal — fijado por pruebas
- ☑ Los tres mecanismos reproducidos, no solo razonados

### Lo que NO resuelve

**No arregla la causa de EXP-011**, solo su daño: convierte tres fallos silenciosos en situaciones recuperables o registradas. La causa raíz del mecanismo A **sigue sin identificar** — se descartó la hipótesis del fencing con varias instancias (ver [PLAN-005](../todo/005-cambio-de-pestanas-con-instancia-viva.md), corrección del 2026-08-14). El registro añadido aquí es lo que producirá el dato.

EXP-011 **permanece activo** por ese motivo. La solución de fondo es [MASTER-PLAN-019](../todo/019-master-plan-servidor-autoritativo-de-colaboracion.md).

### Archivos

`src/collab/pendingEdits.ts` · `src/collab/bindingLifecycle.ts` · `src/utils/incidents.ts` · `src/hooks/useCollab.ts` · `src/store/collabStore.ts` · `src/hooks/useCollab.mechanisms.test.ts`

La lógica se extrajo a módulos propios a propósito: la primera versión de las pruebas replicaba el algoritmo en vez de ejercitarlo, y una prueba que reimplementa lo que verifica deja de detectar el fallo en cuanto el código cambia.
