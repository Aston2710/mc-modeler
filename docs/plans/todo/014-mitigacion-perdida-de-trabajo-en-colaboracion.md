---
id: PLAN-014
titulo: Mitigacion pre-produccion de la perdida silenciosa de trabajo en colaboracion
estado: todo
creado: 2026-08-10
cerrado:
aprobado_por:
relacionados: [EXP-011, PLAN-015, PLAN-013, context/arquitectura-persistencia.md]
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

(se rellena durante la ejecución)

## Resultado

(se rellena al cerrar)
