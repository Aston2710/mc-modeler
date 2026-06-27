# Fix: Texto desaparece / editor se cierra durante edición colaborativa

**Proyecto:** mc-modeler  
**Stack:** bpmn-js v18 · Yjs CRDT · Supabase Realtime  
**Archivo central:** `src/collab/YjsBpmnBinding.ts`  
**Fecha de resolución:** 2026-06-26

---

## Tabla de contenidos

1. [Descripción del problema](#1-descripción-del-problema)
2. [Entorno técnico](#2-entorno-técnico)
3. [Análisis de causa raíz](#3-análisis-de-causa-raíz)
4. [Bugs identificados (C1–C4, M1–M2)](#4-bugs-identificados)
5. [Solución paso a paso](#5-solución-paso-a-paso)
6. [Código antes vs después](#6-código-antes-vs-después)
7. [Patrón reutilizable para otros proyectos](#7-patrón-reutilizable-para-otros-proyectos)
8. [Lección arquitectural: bpmn-js vs Google Docs](#8-lección-arquitectural)

---

## 1. Descripción del problema

**Síntoma observable:**  
En modo colaborativo, el usuario A hace doble clic en un shape y empieza a escribir texto. En ese momento, el usuario B mueve, crea o borra cualquier elemento en cualquier otra parte del diagrama. El resultado es uno o ambos de los siguientes:

- El texto que A había escrito **desaparece** (el campo vuelve al valor anterior o queda vacío).
- El editor de texto **se cierra abruptamente** (el bounding box desaparece, el foco se pierde).

Esto ocurre aunque B esté editando un shape completamente diferente y no relacionado con el de A.

**Impacto:** Fricción máxima en edición colaborativa. Imposible trabajar en simultáneo si hay más de un usuario activo.

---

## 2. Entorno técnico

| Componente | Rol |
|---|---|
| **bpmn-js v18** | Motor BPMN 2.0. Renderiza el canvas, gestiona el CommandStack, provee la API `modeling.*` |
| **diagram-js** | Base de bpmn-js. Provee el `EventBus` con sistema de prioridades |
| **diagram-js-direct-editing** | Módulo de edición inline de texto. API: `directEditing.activate()`, `.complete()`, `.cancel()` |
| **Yjs** | CRDT (Conflict-free Replicated Data Type). `Y.Map<ElementSnapshot>` con semántica Last-Writer-Wins por elemento |
| **Supabase Realtime** | Transporte: difunde updates Yjs (base64) a todos los peers conectados |
| **YjsBpmnBinding** | Clase propia. Bidireccional: `commandStack.changed` → Y.Map (local→Y) y `ymap.observe` → `modeling.*` API (Y→local) |

**Flujo de un cambio remoto:**
```
Peer B mueve shape
  → CommandStack de B ejecuta shape.move
  → YjsBpmnBinding de B detecta commandStack.changed
  → Escribe snapshot al Y.Doc de B
  → Yjs genera update binario
  → Supabase Realtime transmite a todos los peers
  → YjsBpmnBinding de A recibe en ymap.observe
  → applyRemote() → modeling.moveElements() en canvas de A
  → CommandStack de A dispara commandStack.changed   ← PUNTO DE FALLA
```

---

## 3. Análisis de causa raíz

### 3.1 El culpable: `LabelEditingProvider.js`

Dentro de `node_modules/bpmn-js/lib/features/label-editing/LabelEditingProvider.js`, líneas 103–108:

```javascript
// cancel on command stack changes
eventBus.on([ 'commandStack.changed' ], function(e) {
  if (directEditing.isActive()) {
    directEditing.cancel();   // ← CANCELA sin importar qué cambió
  }
});
```

Este listener se registra **sin prioridad explícita**, lo que en diagram-js significa **prioridad 1000** (default).

**Comportamiento:**  
Ante cualquier operación que pase por el CommandStack — incluyendo operaciones de shapes completamente ajenos al que se está editando, incluyendo operaciones remotas aplicadas programáticamente — bpmn-js cancela la edición inline activa.

`directEditing.cancel()` no solo cierra el editor; descarta el texto no confirmado. El texto que el usuario estaba escribiendo se pierde.

### 3.2 El sistema de prioridades de diagram-js EventBus

```
// diagram-js/lib/core/EventBus.js — línea 460-462
EventBus.prototype.fire = function(event, data) {
  // ...
  // Si un handler retorna CUALQUIER valor !== undefined:
  //   → llama stopPropagation()
  //   → handlers de menor prioridad NO se ejecutan
```

```
Prioridad mayor = dispara ANTES
Default = 1000
LabelEditingProvider.commandStack.changed = 1000 (sin prioridad explícita)
Nuestro interceptor = 5000  → dispara PRIMERO
```

### 3.3 Por qué `suppress` no era suficiente

`YjsBpmnBinding` usa un flag `suppress = true` durante `applyRemote()` para evitar eco:  
cuando `modeling.*` dispara `commandStack.changed`, el listener local de `scheduleLocalSync()` comprueba `suppress` y hace early return.

**Pero** `scheduleLocalSync()` es el listener de bpmn-js del binding. `LabelEditingProvider` es un listener completamente independiente, registrado por el propio bpmn-js. No conoce ni comprueba el flag `suppress`. Ambos escuchan el mismo evento, `suppress` solo afecta al listener del binding.

### 3.4 Bug secundario: texto perdido silenciosamente (C1)

Secuencia del bug:
1. A escribe → `commandStack.changed` → `scheduleLocalSync()` arma un debounce timer (40ms)
2. Antes de que expire el timer, llega cambio remoto de B
3. `applyRemote()` avanza `this.last = this.currentSnapshots()` al final
4. El timer expira → `syncLocalToY()` compara `current` con `this.last` → diff vacío
5. El texto de A no se escribe al Y.Doc → se pierde sin ningún error

---

## 4. Bugs identificados

| ID | Nombre | Descripción | Severidad |
|---|---|---|---|
| **C1** | Debounce race | Timer pendiente queda obsoleto cuando `applyRemote()` avanza `this.last` | Alta — pérdida de datos |
| **C2** | LabelEditingProvider cancel | `directEditing.cancel()` disparado por cualquier op remota | Alta — UX rota |
| **C3** | removeElements + directEditing | Borrar el shape activo durante edición corrompe el CommandStack (bpmn-js #1664) | Media |
| **C4** | reconcileCanvasToDoc borra trabajo | Al reconectar, elementos locales no en Y.Map se borraban (pérdida trabajo offline) | Alta — pérdida de datos |
| **M1** | updateProperties cancela edición | `modeling.updateProperties(name/text)` en el elemento activo también cancela la edición | Alta |
| **M2** | applyRemote durante importXML | Cambios remotos aplicados mientras el canvas se re-importa producen estado inconsistente | Media |

---

## 5. Solución paso a paso

### Paso 1 — Agregar flags de control

En la clase `YjsBpmnBinding`, agregar después del campo `debounceTimer`:

```typescript
private importInProgress = false
```

### Paso 2 — Definir el interceptor de alta prioridad (Fix C2)

Este es el fix central. Agregar como campo de clase:

```typescript
// Intercepta commandStack.changed en prioridad 5000 (> 1000 de LabelEditingProvider).
// Retornar false durante suppress → stopPropagation() → cancel() de LabelEditingProvider
// nunca se ejecuta → usuario puede seguir escribiendo aunque lleguen cambios remotos.
private onCommandStackChangedIntercept = (): false | void => {
  if (this.suppress) return false
}
```

**Por qué `return false` y no `return true` o `return undefined`:**  
diagram-js llama `stopPropagation()` ante cualquier valor de retorno que no sea `undefined`. `false` es el valor más explícito semánticamente, pero `true` o cualquier otro valor también funcionaría.

### Paso 3 — Definir handlers de import (Fix M2)

```typescript
private onImportStart = () => {
  this.importInProgress = true
  if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
}
private onImportDone = () => {
  this.importInProgress = false
  this.last = this.currentSnapshots()
}
```

### Paso 4 — Registrar todos los listeners en `start()`

```typescript
start(): void {
  // ... lógica de reconciliación inicial ...

  // Listener principal (local → Y)
  this.modeler.get('eventBus').on('commandStack.changed', this.onCommandStackChanged)

  // NUEVO: interceptor prioridad 5000 para proteger directEditing
  this.modeler.get('eventBus').on('commandStack.changed', 5000, this.onCommandStackChangedIntercept)

  // NUEVO: guards para importXML
  this.modeler.get('eventBus').on('import.render.start', this.onImportStart)
  this.modeler.get('eventBus').on('import.done', this.onImportDone)

  // Observer Yjs (sin cambios)
  this.observer = (event, tx) => {
    if (tx.origin === this.origin) return
    this.applyRemote(event)
  }
  this.ymap.observe(this.observer)
}
```

### Paso 5 — Limpiar en `destroy()`

```typescript
destroy(): void {
  if (this.debounceTimer) clearTimeout(this.debounceTimer)
  try {
    this.modeler.get('eventBus').off('commandStack.changed', this.onCommandStackChanged)
    this.modeler.get('eventBus').off('commandStack.changed', this.onCommandStackChangedIntercept)  // NUEVO
    this.modeler.get('eventBus').off('import.render.start', this.onImportStart)  // NUEVO
    this.modeler.get('eventBus').off('import.done', this.onImportDone)           // NUEVO
  } catch { /* modeler ya destruido */ }
  if (this.observer) this.ymap.unobserve(this.observer)
  this.observer = null
}
```

### Paso 6 — Corregir `scheduleLocalSync()` (Fix C1, parte 1)

```typescript
private scheduleLocalSync() {
  if (this.suppress || this.importInProgress) {
    // Cancelar timer pendiente — su diff quedaría obsoleto porque applyRemote/import
    // va a avanzar this.last. El flush correcto se hace en applyRemote().
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    return
  }
  if (this.debounceTimer) clearTimeout(this.debounceTimer)
  this.debounceTimer = setTimeout(() => this.syncLocalToY(), SYNC_DEBOUNCE_MS)
}
```

**Diferencia clave respecto al código anterior:**  
Antes, el early return por `suppress` no cancelaba el timer. El timer quedaba vivo y al expirar encontraba un diff vacío porque `this.last` ya había avanzado.

### Paso 7 — Corregir `applyRemote()` (Fix C1, parte 2 + M2)

Agregar al inicio del método, antes de cualquier operación:

```typescript
private applyRemote(event: Y.YMapEvent<ElementSnapshot>) {
  // (M2) No aplicar si el canvas está siendo re-importado
  if (this.importInProgress) return

  // (C1) Flush del sync local pendiente ANTES de avanzar this.last
  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer)
    this.debounceTimer = null
    this.syncLocalToY()  // escribe el estado actual al Y.Doc inmediatamente
  }

  // ... resto del método sin cambios estructurales ...
```

### Paso 8 — Agregar guard `beingEdited` en `updateElement()` (Fix M1)

Dentro del bloque que actualiza `name` y `text`, agregar la comprobación:

```typescript
// (M1) Omitir si el usuario está editando activamente este elemento.
// modeling.updateProperties() durante directEditing también cancela la edición.
let beingEdited = false
try {
  const de = this.modeler.get('directEditing')
  if (de?.isActive()) {
    const activeEl = de.getActive()?.element
    beingEdited = activeEl?.id === snap.id || activeEl?.id === (el as Any).label?.id
  }
} catch { /* noop */ }

if (!beingEdited && snap.name != null && el.businessObject?.name !== snap.name) {
  modeling.updateProperties(el, { name: snap.name })
}
if (!beingEdited && snap.text != null && el.businessObject?.text !== snap.text) {
  modeling.updateProperties(el, { text: snap.text })
}
```

**Por qué `activeEl?.id === (el as Any).label?.id`:**  
Los elementos con external label (eventos, gateways) tienen un sub-elemento `label`. El usuario edita el label, no el shape directamente. `de.getActive().element` devuelve el label, pero el snapshot tiene el id del shape padre.

### Paso 9 — Proteger `removeElement()` (Fix C3)

```typescript
private removeElement(id: string) {
  try {
    const el = this.modeler.get('elementRegistry').get(id)
    if (!el) return

    // (C3) bpmn-js #1664: removeElements() durante directEditing activo sobre este
    // elemento corrompe el CommandStack. Cancelar antes de borrar.
    try {
      const de = this.modeler.get('directEditing')
      if (de?.isActive()) {
        const activeEl = de.getActive()?.element
        if (activeEl?.id === id || activeEl?.id === (el as Any).label?.id)
          de.cancel()
      }
    } catch { /* noop */ }

    this.modeler.get('modeling').removeElements([el])
  } catch (e) {
    console.warn('[collab] removeElement falló', id, e)
  }
}
```

### Paso 10 — Corregir `reconcileCanvasToDoc()` (Fix C4)

**Antes:** elementos en canvas pero ausentes del Y.Map → `removeElement()` → pérdida de trabajo offline.

**Después:** publicar al Y.Map en lugar de borrar.

```typescript
// (C4) Elementos en canvas pero ausentes del Y.Doc → publicarlos al doc (no borrar).
// "Ausente del Y.Map" en reconciliación inicial ≠ "borrado remotamente".
// Puede ser trabajo offline que el Y.Doc aún no conoce.
this.doc.transact(() => {
  current.forEach((snap, id) => {
    if (!this.ymap.has(id)) this.ymap.set(id, snap)
  })
}, this.origin)
```

---

## 6. Código antes vs después

### `scheduleLocalSync()`

**Antes:**
```typescript
private scheduleLocalSync() {
  if (this.suppress) return   // ← timer NO se cancela, queda vivo
  if (this.debounceTimer) clearTimeout(this.debounceTimer)
  this.debounceTimer = setTimeout(() => this.syncLocalToY(), SYNC_DEBOUNCE_MS)
}
```

**Después:**
```typescript
private scheduleLocalSync() {
  if (this.suppress || this.importInProgress) {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    return
  }
  if (this.debounceTimer) clearTimeout(this.debounceTimer)
  this.debounceTimer = setTimeout(() => this.syncLocalToY(), SYNC_DEBOUNCE_MS)
}
```

### Inicio de `applyRemote()`

**Antes:**
```typescript
private applyRemote(event: Y.YMapEvent<ElementSnapshot>) {
  const registry = this.modeler.get('elementRegistry')
  // ... directamente a procesar cambios
```

**Después:**
```typescript
private applyRemote(event: Y.YMapEvent<ElementSnapshot>) {
  if (this.importInProgress) return

  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer)
    this.debounceTimer = null
    this.syncLocalToY()
  }
  // ... procesar cambios
```

### Listeners registrados en `start()`

**Antes:**
```typescript
this.modeler.get('eventBus').on('commandStack.changed', this.onCommandStackChanged)
```

**Después:**
```typescript
this.modeler.get('eventBus').on('commandStack.changed', this.onCommandStackChanged)
this.modeler.get('eventBus').on('commandStack.changed', 5000, this.onCommandStackChangedIntercept)
this.modeler.get('eventBus').on('import.render.start', this.onImportStart)
this.modeler.get('eventBus').on('import.done', this.onImportDone)
```

### Actualización de `name`/`text` en `updateElement()`

**Antes:**
```typescript
if (snap.name != null && el.businessObject?.name !== snap.name) {
  modeling.updateProperties(el, { name: snap.name })
}
```

**Después:**
```typescript
let beingEdited = false
try {
  const de = this.modeler.get('directEditing')
  if (de?.isActive()) {
    const activeEl = de.getActive()?.element
    beingEdited = activeEl?.id === snap.id || activeEl?.id === (el as Any).label?.id
  }
} catch { /* noop */ }

if (!beingEdited && snap.name != null && el.businessObject?.name !== snap.name) {
  modeling.updateProperties(el, { name: snap.name })
}
```

---

## 7. Patrón reutilizable para otros proyectos

### Problema general

Cualquier proyecto que combine **bpmn-js + edición colaborativa en tiempo real** (Yjs, ShareDB, Firebase, socket.io, etc.) encontrará el mismo problema: las operaciones remotas aplicadas vía `modeling.*` pasan por el CommandStack, que dispara `commandStack.changed`, que `LabelEditingProvider` interpreta como señal para cancelar la edición inline.

### Checklist de diagnóstico

Si el editor de texto se cierra al llegar cambios remotos en un proyecto bpmn-js:

1. Confirmar que `LabelEditingProvider.js` está presente en el proyecto (`node_modules/bpmn-js/lib/features/label-editing/`)
2. Buscar `commandStack.changed` en ese archivo → confirmar que llama `directEditing.cancel()`
3. Confirmar que las ops remotas se aplican vía `modeling.*` (no vía importXML directo)
4. El fix es siempre el mismo: interceptor de alta prioridad

### El fix en 15 líneas (portable)

```javascript
// En la clase/módulo que aplica cambios remotos al canvas:

let suppress = false

// Registrar UNA SOLA VEZ al inicializar el binding:
modeler.get('eventBus').on('commandStack.changed', 5000, () => {
  if (suppress) return false  // stopPropagation → LabelEditingProvider.cancel() no ejecuta
})

// En la función que aplica cambios remotos:
function applyRemoteChanges(changes) {
  suppress = true
  try {
    // ... modeling.moveElements(), modeling.createShape(), etc.
  } finally {
    suppress = false
  }
}
```

### Por qué prioridad 5000

diagram-js usa estas prioridades conocidas:

| Prioridad | Componente |
|---|---|
| 2000 | `LabelEditingProvider` para `shape.remove` / `connection.remove` |
| 1000 | Default (incluyendo `LabelEditingProvider.commandStack.changed`) |
| 500 | `create.end`, `autoPlace.end` en `LabelEditingProvider` |

Cualquier valor > 1000 funciona para el interceptor de `commandStack.changed`. Se usa 5000 para dejar margen ante futuros listeners de bpmn-js que puedan agregarse en versiones futuras con prioridades intermedias.

### Guard adicional: `updateProperties` en el elemento activo

`modeling.updateProperties(element, { name: ... })` también dispara `commandStack.changed`. Aunque el interceptor lo bloquea con `suppress=true`, si el cambio remoto actualiza el nombre/texto del elemento que está siendo editado actualmente, el resultado final (cuando el usuario confirme) sobrescribirá lo que vino del peer. Mejor saltárselo completamente:

```javascript
function shouldSkipTextUpdate(element, directEditing) {
  if (!directEditing.isActive()) return false
  const active = directEditing.getActive()?.element
  return active?.id === element.id || active?.id === element.label?.id
}
```

### Guard para `removeElements` con directEditing activo

Borrar un elemento mientras está siendo editado puede corromper el CommandStack en bpmn-js (issue #1664). Siempre verificar antes de `modeling.removeElements()`:

```javascript
function safeRemoveElement(modeler, id) {
  const el = modeler.get('elementRegistry').get(id)
  if (!el) return
  const de = modeler.get('directEditing')
  if (de?.isActive()) {
    const active = de.getActive()?.element
    if (active?.id === id || active?.id === el.label?.id) de.cancel()
  }
  modeler.get('modeling').removeElements([el])
}
```

---

## 8. Lección arquitectural

### Por qué es difícil hacer colaborativo en bpmn-js

**Google Docs** opera con dos capas separadas:
- **Capa CRDT / modelo**: recibe y aplica operaciones remotas directamente al modelo de datos. La UI de edición nunca se toca.
- **Capa de UI de edición**: solo se sincroniza cuando el usuario confirma explícitamente (guarda, pierde el foco, etc.).

**bpmn-js** tiene una sola capa:
- Toda operación — local o remota — pasa por el `CommandStack`.
- El `CommandStack` emite `commandStack.changed` ante cualquier operación.
- `LabelEditingProvider` escucha ese evento y cancela la edición.
- No hay forma de aplicar ops "en silencio" sin pasar por el CommandStack (salvo forkear bpmn-js o reimportar el XML completo, que tiene sus propios problemas).

### La solución práctica

Sin forkear bpmn-js, el enfoque correcto es **interceptar el EventBus antes de que los efectos secundarios se propaguen**. El interceptor de alta prioridad es equivalente a la separación de capas de Google Docs, implementada como una capa de filtrado sobre el bus de eventos existente.

```
Remote op llega
  → modeling.* → CommandStack → commandStack.changed
  → [INTERCEPTOR p.5000] → suppress=true → return false → stopPropagation()
  → LabelEditingProvider (p.1000) → NUNCA LLEGA → cancel() no ejecuta
  → Usuario sigue escribiendo sin interrupción ✓
```

Este patrón es la aproximación más cercana posible a la arquitectura de dos capas de Google Docs dentro de las restricciones de bpmn-js, sin modificar el código fuente del paquete.
