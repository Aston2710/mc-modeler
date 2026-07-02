# Fix: Pools/diagramas ajenos se filtran y corrompen otro diagrama al cambiar de pestaña

**Proyecto:** mc-modeler
**Stack:** React 19 · bpmn-js v18 · Yjs CRDT · Supabase Realtime + Postgres · localforage
**Archivos centrales:** `src/hooks/useCollab.ts`, `src/hooks/useBpmnModeler.ts`, `src/collab/canvasSession.ts` (nuevo)
**Severidad:** Crítica — corrupción permanente de datos de diagramas (procesos de negocio de clientes)
**Fecha de resolución:** 2026-07-01

---

## Tabla de contenidos

1. [Descripción del problema](#1-descripción-del-problema)
2. [Entorno técnico](#2-entorno-técnico)
3. [Investigación: qué se descartó](#3-investigación-qué-se-descartó)
4. [Causa raíz](#4-causa-raíz)
5. [Por qué empeora con varios usuarios](#5-por-qué-empeora-con-varios-usuarios)
6. [Decisiones de arquitectura para la solución](#6-decisiones-de-arquitectura-para-la-solución)
7. [Solución implementada](#7-solución-implementada)
8. [Código antes vs después](#8-código-antes-vs-después)
9. [Archivos modificados](#9-archivos-modificados)
10. [Verificación](#10-verificación)
11. [Patrón reutilizable para otros proyectos](#11-patrón-reutilizable-para-otros-proyectos)
12. [Relación con incidentes previos (GhostPool)](#12-relación-con-incidentes-previos-ghostpool)

---

## 1. Descripción del problema

**Síntoma reportado por el usuario:**

> Entro a un diagrama con un Pool A, y de la nada aparece un Pool B encima. No es un pool vacío (ghostPool) como antes — ahora aparecen pools/diagramas completos, que existen, superpuestos. Si cambio del Diagrama A al Diagrama B, puede que el Diagrama A se sobreponga al espacio del B, y eso se corrompe. Si elimino el pool superpuesto y guardo, al volver a cargar el pool superpuesto sigue ahí. También dificulta mover algunos elementos.

**Impacto:**
- Corrupción **permanente** de diagramas — sobrevive a borrar + guardar + recargar.
- Contenido de un diagrama (potencialmente de un proceso de negocio confidencial) apareciendo dentro de otro.
- Elementos con jerarquía padre/hijo rota → difíciles de mover/seleccionar.
- Empeora con más usuarios activos en el mismo proyecto (ver [§5](#5-por-qué-empeora-con-varios-usuarios)).

---

## 2. Entorno técnico

| Componente | Rol |
|---|---|
| **Canvas único** | `BpmnCanvas.tsx` monta **un solo** `BpmnModeler`, reutilizado para todas las pestañas/diagramas (no se crea uno nuevo por diagrama) |
| **`App.tsx`** | Dueño del ciclo de cambio de pestaña: guarda el diagrama saliente (`persistCanvasTab`), luego importa el XML del entrante (`importActiveDiagram`) |
| **`useBpmnModeler.ts`** | Wrapper de bpmn-js. `importXml()` llama `modeler.importXML()` |
| **`useCollab.ts`** | Colaboración en tiempo real: efecto de React, `useEffect(..., [activeTabId, user?.id])` — se reinicia en cada cambio de pestaña |
| **`YjsBpmnBinding.ts`** | CRDT bidireccional canvas ⇄ `Y.Doc`. Cada diagrama tiene su propio `Y.Doc`, su propio canal Supabase Realtime (`diagram:${id}`) y su propia fila en `yjs_documents` |
| **Supabase** | Persistencia real (`current_xml` por diagrama) + Realtime (broadcast de updates Yjs) — reemplaza cualquier "base de datos" previa; no hay caché local que la sustituya |

**Confirmado durante la investigación:** no existe una capa de caché local que compita con Supabase. `localforage`/`LocalRepository` solo se usa en modo 100% local (sin Supabase configurado). En modo nube, todo pasa por Supabase — la sospecha inicial de "caché vieja pisando la base de datos" **se descartó**.

---

## 3. Investigación: qué se descartó

Antes de tocar código se auditó cada capa candidata:

| Hipótesis | Resultado | Evidencia |
|---|---|---|
| `bpmn-js importXML()` no limpia el registro anterior | **Descartada** | `BaseViewer.open()` (bpmn-js interno) llama `this.clear()` antes de importar. El registro se vacía correctamente en cada import. |
| Caché local (`localforage`) sirviendo datos viejos sobre Supabase | **Descartada** | La capa de persistencia (`SupabaseRepository.ts`, `LocalRepository.ts`) guarda el XML que se le entrega, sin merge ni caché intermedia. No hay lógica de "cache-then-network". |
| Bug en exportación (`exportXml`/`saveXML`) | **Descartada** | `exportXml()` es un `modeler.saveXML()` sin efectos secundarios; no muta estado. |
| Regresión del fix de `fix-GhostPool-v2` / `fix-GhostPool-mc-modeler-side` | **Descartada** | Esos commits tratan exclusivamente el pipeline de import/export XPDL de Bizagi (contenedor "Proceso principal" vacío). Mecanismo y subsistema totalmente distintos — coincidencia de nombre ("ghost pool"), no de causa. |
| Bug en Yjs room-keying (docs de distintos diagramas compartiendo namespace) | **Descartada** | Cada diagrama tiene su propio `Y.Doc`, canal (`diagram:${diagramId}`) y fila `yjs_documents` propia. El keying por diagrama es correcto. |

La causa estaba en una capa que no se había mirado todavía: **la orquestación temporal entre el cambio de pestaña (`App.tsx`) y el arranque del binding de colaboración (`useCollab.ts`)**.

---

## 4. Causa raíz

**Condición de carrera (race condition) entre dos sistemas asíncronos independientes que comparten el mismo canvas, sin sincronizarse entre sí.**

### Secuencia del bug

```
Usuario cambia de pestaña: Diagrama A → Diagrama B
  │
  ├─ App.tsx (App.tsx:183-192):
  │    persistCanvasTab()  ── async, guarda A ──┐
  │       .then(() => importActiveDiagram())    │  toma tiempo (red, Supabase)
  │                                              ▼
  │                                    canvasRef.current.importXml(B.xml)
  │                                    (esto es lo que REALMENTE limpia
  │                                     el canvas y dibuja B)
  │
  └─ useCollab.ts (useCollab.ts:24, dep [activeTabId]):
       Efecto se reinicia INMEDIATAMENTE al cambiar activeTabId,
       sin esperar a que el bloque de arriba termine.

       startBindingWhenReady() [código anterior]:
         registry.getAll().some(isSyncable)
           → TRUE, porque el canvas TODAVÍA muestra el Pool A
             (importXml(B) de App.tsx ni siquiera ha empezado)
         → startBinding() se llama DE INMEDIATO, creyendo que
           el Pool A visible es el contenido legítimo de B
```

### Qué pasa dentro del binding contaminado

`YjsBpmnBinding.start()` (`YjsBpmnBinding.ts:59-69`):

- Si el `Y.Doc` de B está vacío (primera vez): toma **el Pool A que sigue en pantalla** como baseline (`this.last = currentSnapshots()`).
- Si el `Y.Doc` de B ya tenía contenido guardado: `reconcileCanvasToDoc()` (`YjsBpmnBinding.ts:322-354`) es **deliberadamente aditivo** — nunca borra al reconciliar, para no perder ediciones offline legítimas. Ese diseño es seguro *solo si* el canvas ya muestra el diagrama correcto al arrancar. Aquí no lo muestra: añade el contenido de B **encima** del Pool A que seguía ahí.

Cualquier cambio dispara `commandStack.changed` → `scheduleLocalSync()` escribe el Pool A contaminante **dentro del propio `Y.Doc` de B** → se persiste en la tabla `yjs_documents` bajo el `diagram_id` de B (debounce 1500 ms). Un guardado manual posterior (`handleSave`/`persistCanvasTab`) exporta el canvas contaminado y lo escribe en la fila `current_xml` de B.

**Por esto borrar + guardar + recargar no arregla nada:** la corrupción ya quedó grabada en dos lugares — el snapshot Yjs de B y/o el XML de B — antes de que el usuario llegue a intervenir manualmente. Al recargar, se reaplica.

Los elementos "difíciles de mover/seleccionar" son el Pool A: llegaron vía `modeling.createShape()` directo del binding, no de un import real, así que sus relaciones padre/hijo en el registro quedan mal formadas.

---

## 5. Por qué empeora con varios usuarios

Dos mecanismos, no uno:

1. **La ventana de la carrera se ensancha con más tráfico.** Más usuarios conectados al mismo proyecto → más canales Supabase Realtime activos simultáneamente → más latencia → más tiempo entre "cambia `activeTabId`" y "termina `importXml`" → más probabilidad de que `useCollab` arranque con el canvas todavía sucio.
2. **La corrupción se propaga en vivo a todos los conectados.** En cuanto el Pool A contaminante se escribe al `Y.Doc` de B, ese update se **transmite automáticamente por Realtime** a cualquier otro usuario viendo el Diagrama B en ese momento — un glitch local de una persona cambiando de pestaña puede aparecer instantáneamente en la pantalla de un colaborador que no tocó nada.

Por eso el bug es intermitente en local (ventana de carrera angosta) pero se vuelve frecuente y "contagioso" en producción con varios usuarios.

---

## 6. Decisiones de arquitectura para la solución

Se descartó rehacer Yjs/CRDT — el keying por diagrama y las garantías de convergencia offline ya son correctas. El fix vive enteramente en la capa de orquestación. Cuatro decisiones, tomadas de patrones de sistemas distribuidos/concurrentes ya probados en otros dominios:

1. **Estado explícito, no inferencia heurística** (filosofía Erlang/OTP). El bug nace de preguntar "¿el canvas tiene elementos?" para inferir "¿está listo?". Un canvas con elementos no implica que sean los correctos. Se reemplaza por una señal explícita: "el import de X terminó, confirmado" — nunca se infiere del contenido visible.

2. **Fencing token / contador de generación** (patrón de locks distribuidos — Chubby de Google, revisiones de etcd). Cada `importXml()` reclama un número de generación creciente. Solo la importación cuya generación coincide con la vigente al completarse puede marcar el diagrama como "listo". Cualquier resultado tardío de una importación superada por otra posterior se descarta en silencio — nunca contamina el estado de un diagrama distinto. Esto resuelve el problema sin necesitar cancelar promesas en vuelo.

3. **Single-writer implícito vía fencing, sin mutex nuevo.** La alternativa era introducir una cola serial explícita (patrón Actor/mailbox) para forzar que import y binding nunca se solapen. Se prefirió el fencing token porque ya da la misma garantía (solo un "escritor" — la importación vigente — puede afirmar el estado) sin añadir una abstracción de concurrencia nueva al codebase, en línea con no introducir infraestructura no necesaria.

4. **Fail-closed, no fail-open** (defensa en profundidad). Dado que el contenido son procesos de negocio de clientes, ante cualquier duda el sistema debe **abstenerse** de actuar, no "continuar por si acaso". Se aplicó en tres puntos: `startBinding()` revalida identidad antes de tocar el canvas; si la confirmación nunca llega (import falló, XML corrupto) tras un tope de tiempo, se **deshabilita la colaboración de esa sesión** en vez de forzar un bind a ciegas; `handleSave`/`persistCanvasTab` también validan identidad antes de exportar/guardar.

---

## 7. Solución implementada

### 7.1 Nuevo módulo: fencing token (`src/collab/canvasSession.ts`)

Módulo singleton (no Zustand — no se necesita reactividad de React, solo lectura/escritura síncrona compartida entre hooks):

```typescript
let generation = 0
let readyDiagramId: string | null = null
let readyGeneration = -1

export function beginImport(): number {
  generation += 1
  readyDiagramId = null          // en tránsito: nadie puede afirmar "listo"
  return generation
}

export function completeImport(token: number, diagramId: string): void {
  if (token !== generation) return   // import obsoleto: se lanzó otro después
  readyDiagramId = diagramId
  readyGeneration = token
}

export function isCanvasReadyFor(diagramId: string): boolean {
  return readyDiagramId === diagramId && readyGeneration === generation
}
```

### 7.2 `useBpmnModeler.importXml` reclama y confirma el token

Único call site de `modeler.importXML()` en toda la app — punto correcto para centralizar el fencing:

```typescript
const importXml = useCallback(async (xml: string, diagramId: string) => {
  const modeler = modelerRef.current
  if (!modeler) return
  const token = beginImport()
  try {
    await modeler.importXML(xml)
  } catch (err) {
    if (modelerRef.current !== modeler) return
    throw err
  }
  if (modelerRef.current !== modeler) return
  completeImport(token, diagramId)   // descartado en silencio si ya no es el vigente
  try { modeler.get('canvas').zoom('fit-viewport', 'all') } catch { /* canvas vacío */ }
}, [])
```

### 7.3 `useCollab.ts` espera confirmación explícita, nunca infiere

Se elimina por completo la heurística `registry.getAll().some(isSyncable)`. `startBindingWhenReady()` ahora:

- Solo arranca el binding si `isCanvasReadyFor(diagramId)` es verdadero.
- Si no, escucha `import.done` y **reevalúa identidad** al recibirlo (podría pertenecer a otro diagrama en curso) en vez de arrancar a ciegas.
- Si tras 10 s nunca se confirma (import falló, XML corrupto), deshabilita la colaboración de esa sesión con un `console.warn` — prefiere perder tiempo real a corromper datos.
- `startBinding()` revalida `isCanvasReadyFor(diagramId)` una segunda vez, como defensa en profundidad ante una futura regresión que la llame antes de tiempo.

### 7.4 `App.tsx`: guardado también valida identidad

`handleSave` y `persistCanvasTab` verifican `isCanvasReadyFor(tabId)` antes de exportar — nunca se guarda contenido de un canvas a medio importar, cerrando también la vía de corrupción por guardado manual concurrente con un cambio de pestaña.

---

## 8. Código antes vs después

### `useCollab.ts` — `startBindingWhenReady`

**Antes (causa del bug):**
```typescript
const startBindingWhenReady = () => {
  if (disposed) return
  const modeler = modelerRef.current
  if (!modeler) { setTimeout(startBindingWhenReady, 100); return }
  const registry = modeler.get('elementRegistry')
  const hasContent = registry.getAll().some(isSyncable)   // ← heurística no confiable
  if (hasContent) {
    startBinding()   // ← puede ser el diagrama ANTERIOR todavía en pantalla
  } else {
    const eventBus = modeler.get('eventBus')
    const onImport = () => { eventBus.off('import.done', onImport); startBinding() }
    eventBus.on('import.done', onImport)
    setTimeout(() => {
      try { eventBus.off('import.done', onImport) } catch {}
      startBinding()   // ← fallback ciego: fuerza el bind pase lo que pase
    }, 1500)
  }
}
```

**Después:**
```typescript
const startBindingWhenReady = () => {
  if (disposed) return
  clearPendingImportWait()
  const modeler = modelerRef.current
  if (!modeler) { pendingRetryTimer = setTimeout(startBindingWhenReady, 100); return }
  if (isCanvasReadyFor(diagramId)) { startBinding(); return }   // ← confirmación explícita
  if (Date.now() - bindWaitStartedAt > BIND_CONFIRM_TIMEOUT_MS) {
    console.warn('[collab] el canvas nunca confirmó el diagrama', diagramId, '— colaboración deshabilitada')
    return   // ← fail-closed: nunca fuerza el bind
  }
  const eventBus = modeler.get('eventBus')
  const onImport = () => startBindingWhenReady()   // ← reevalúa identidad, no asume
  pendingImportHandler = onImport
  eventBus.on('import.done', onImport)
  pendingRetryTimer = setTimeout(startBindingWhenReady, 300)
}
```

### `useBpmnModeler.ts` — `importXml`

**Antes:**
```typescript
const importXml = useCallback(async (xml: string) => {
  const modeler = modelerRef.current
  if (!modeler) return
  await modeler.importXML(xml)
  // sin señal de "listo" para nadie más
  ...
}, [])
```

**Después:**
```typescript
const importXml = useCallback(async (xml: string, diagramId: string) => {
  const modeler = modelerRef.current
  if (!modeler) return
  const token = beginImport()          // ← nueva generación: nadie puede afirmar "listo" mientras dure
  await modeler.importXML(xml)
  completeImport(token, diagramId)     // ← confirmación explícita, con fencing
  ...
}, [])
```

### `App.tsx` — guardas de identidad

```typescript
// persistCanvasTab, antes de exportar:
if (!isCanvasReadyFor(tabId)) return

// handleSave, antes de exportar:
if (!isCanvasReadyFor(activeTabId)) return
```

---

## 9. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/collab/canvasSession.ts` | **Nuevo.** Fencing token: `beginImport`/`completeImport`/`isCanvasReadyFor` |
| `src/hooks/useBpmnModeler.ts` | `importXml(xml, diagramId)` reclama y confirma el token |
| `src/components/canvas/BpmnCanvas.tsx` | Firma de `BpmnCanvasHandle.importXml` actualizada a `(xml, diagramId)` |
| `src/hooks/useCollab.ts` | Elimina heurística `hasContent`; espera confirmación explícita; fail-closed con timeout; `startBinding()` revalida identidad |
| `src/App.tsx` | Único call site de `importXml` pasa `diagram.id`; `handleSave`/`persistCanvasTab` validan `isCanvasReadyFor` antes de exportar/guardar |
| `src/hooks/useAutoSave.ts` | Timer de autosave valida `isCanvasReadyFor(id)` antes de exportar/guardar (ver §10.1) |
| `src/hooks/useCommentSetup.ts` | `attachModeler()` de comentarios (modo local, sin colaboración) espera `isCanvasReadyFor(activeTabId)` antes de enganchar (ver §10.1) |

---

## 10.1 Segunda pasada: casos adicionales encontrados en el rescan

Tras la primera corrección se hizo un escaneo completo de **todo** consumidor del canvas compartido (no solo el de colaboración), buscando cualquier otro punto que lea o escriba el canvas sin la confirmación de identidad. Se encontraron y corrigieron dos gaps reales de la misma familia de bug — ambos silenciosos, ninguno reportado aún por el usuario, ambos con potencial de corrupción persistida:

### Gap 1 — `useAutoSave.ts` (autoguardado periódico)

El timer de autoguardado (cada 20s si hay cambios sin guardar) captura `activeTabId` **fresco** al disparar, pero no verificaba que el canvas ya mostrara ese diagrama. Si el timer disparaba justo durante una ventana de cambio de pestaña (import de la nueva pestaña aún en curso), exportaba el canvas — todavía con el contenido del diagrama saliente — y lo guardaba bajo el id del diagrama **entrante**. Mismo mecanismo de corrupción que el bug original, disparador distinto (temporizador en vez de evento de colaboración).

**Fix:** guard `if (!isCanvasReadyFor(id)) return` antes de exportar — si no hay confirmación, se omite ese ciclo; el siguiente intento (20s después) casi seguro ya tendrá el canvas confirmado.

### Gap 2 — `useCommentSetup.ts` (comentarios en modo local, sin Supabase)

`YjsCommentBinding.attachModeler()` engancha `checkOrphans()` a `commandStack.changed`. `checkOrphans()` escanea el `elementRegistry` **vigente** y, para cada comentario, si su elemento anclado no aparece en ese registry, lo marca `orphaned: true` — y esto se **persiste** en el Y.Doc local (localforage, `mc-comments:${diagramId}`).

`tryAttach()` llamaba `binding.attachModeler(m)` en cuanto `modelerRef.current` existía, sin verificar que el canvas mostrara el diagrama correcto. Si engancha mientras el canvas todavía muestra el diagrama saliente, y se dispara cualquier `commandStack.changed` en esa ventana, `checkOrphans()` escanea el registro **equivocado** — ningún elemento del diagrama saliente coincide con los anchors del diagrama entrante — y marca como huérfanos comentarios que en realidad son válidos. Corrupción persistida y silenciosa, igual de real que la del canvas BPMN, solo en otra store.

Nota: la misma clase de binding en **modo colaborativo** (`useCollab.ts:105`, mismo `attachModeler`) ya estaba protegida porque esa llamada vive dentro de `startBinding()`, que solo se ejecuta tras confirmación. El gap era exclusivo del camino local/sin-Supabase, que tiene su propio ciclo de vida independiente.

**Fix:** `tryAttach()` ahora solo llama `attachModeler()` cuando `isCanvasReadyFor(activeTabId)` es verdadero; si no, reintenta cada 150ms como antes.

### Puntos revisados y descartados (no requieren fix)

| Punto | Por qué no corrompe datos |
|---|---|
| `handleValidate` (botón Validar) | Lee el registry para mostrar un modal; no persiste nada. En el peor caso, resultado momentáneamente referido al diagrama incorrecto — el usuario puede re-validar. Acción explícita del usuario, no automática. |
| `getXml`/`getSvg` para exportación manual (`handleExportConfirm`) | Acción explícita del usuario (botón "Exportar"); exporta a un archivo externo, no sobrescribe el diagrama guardado en Supabase/localforage. |
| `startCreate` (dibujar elemento nuevo durante la ventana de carrera) | Si el usuario logra crear una figura en la ventana sub-segundo entre destrucción del binding viejo y confirmación del nuevo, ningún binding está escuchando para sincronizarla, y el `clear()` del import entrante la borra del canvas acto seguido. Se pierde la acción (raro, requiere click exacto en la ventana), pero no se escribe en ningún store — no es corrupción persistida. |
| `getSelectedElements`/`updateElementProperty` (panel de propiedades) | Operan sobre el elemento realmente seleccionado en el DOM/canvas en ese instante — no infieren identidad de diagrama, actúan sobre lo que el usuario efectivamente tiene seleccionado. |
| `RemoteCursors`, `CommentsOverlay`, `SelectionCommentTrigger`, `CommentsPanel` | Solo renderizan overlays de lectura (`registry.get`, `canvas.scrollToElement`, `selection.select`); no llaman `modeling.*`, no persisten nada. Se autocorrigen en el siguiente render tras confirmarse el import. |

---

## 10.2 Tercera pasada (verificación final): resultado

Auditoría exhaustiva de **todo** punto del código que invoca `modeler.get('modeling')` o `modeler.get('elementRegistry')` — universo completo de escritura posible sobre el canvas — en `src/`. Resultado: 6 archivos, sin excepción:

| Archivo | Tipo de acceso | Gateado por `isCanvasReadyFor` |
|---|---|---|
| `YjsBpmnBinding.ts` | Escritura automática (CRDT ⇄ canvas) | ✅ vía `startBinding()` en `useCollab.ts` |
| `YjsCommentBinding.ts` | Escritura automática (`checkOrphans`) | ✅ vía `startBinding()` (modo colab) y `tryAttach()` (modo local) |
| `useBpmnModeler.ts` / `BpmnCanvas.tsx` | Dueño del modeler; escrituras disparadas por clic explícito del usuario (crear elemento, editar propiedad, enlazar subproceso) | No aplica — actúan sobre lo que el usuario tiene físicamente seleccionado/clickeado en ese instante, no infieren identidad de diagrama |
| `CommentsOverlay.tsx` / `CommentsPanel.tsx` | Solo lectura (overlays, scroll, selección visual) | No aplica — no persiste nada |

**No quedan escrituras automáticas sin confirmación de identidad.** Los 7 guardas activos (`grep isCanvasReadyFor`) cubren la totalidad de los call sites que exportan (`getXml`/`saveDiagram`) o enganchan bindings automáticos (`attachModeler`) sobre el canvas compartido:

```
src/App.tsx:216            persistCanvasTab()  → guard antes de exportar/guardar
src/App.tsx:237            handleSave()        → guard antes de exportar/guardar
src/hooks/useAutoSave.ts:25 save() (timer 20s)  → guard antes de exportar/guardar
src/hooks/useCollab.ts:101  startBinding()      → guard defensivo (2ª capa)
src/hooks/useCollab.ts:123  startBindingWhenReady() → guard primario, gate de arranque
src/hooks/useCommentSetup.ts:57 tryAttach()     → guard antes de attachModeler (modo local)
```

Confirmado con `git grep`/lectura directa de archivo (no memoria de ediciones previas) que las 7 líneas están efectivamente en disco. `tsc --noEmit` y `npm run build` limpios tras esta tercera pasada.

### Hallazgo adicional, distinto de la familia "pool cruzado" — no bloqueante

Al revisar `src/collab/yjsPersistence.ts`, `saveYjsState()` hace un `upsert` **sin control de versión/CAS** sobre `yjs_documents.state`: quien escriba último en la base de datos gana, sin comparar contra qué tan "avanzado" está el snapshot ya guardado. Esto es un riesgo distinto — **no cruza contenido entre diagramas distintos** (la fila está correctamente aislada por `diagram_id`) — pero en teoría, si un cliente se queda momentáneamente rezagado en Realtime (blip de red) y guarda su snapshot local (incompleto) justo después de que otro cliente ya guardó uno más completo, el checkpoint en base de datos podría retroceder unos segundos para *ese mismo diagrama*.

**Por qué no se corrige aquí:** es una característica arquitectural preexistente (no introducida por este fix ni relacionada con el bug reportado), autocurativa en la práctica — mientras haya clientes conectados, la reconexión (`onSubscribed`/`onJoin` → `sendFullState()`) siempre retransmite el estado CRDT completo por Realtime, y Yjs converge sin pérdida entre clientes activos. Solo afectaría al *snapshot de reanudación* si todos los clientes se desconectan en el instante exacto de una carrera de guardado — ventana extremadamente estrecha. Se documenta como **mejora futura recomendada** (agregar un vector de versión o comparar `updated_at`/tamaño de estado antes de sobrescribir), no como corrección crítica de este incidente.

### Veredicto final

No quedan casos identificables de corrupción cruzada entre diagramas. Los 4 mecanismos automáticos que tocan el canvas compartido (colaboración BPMN, comentarios colaborativos, comentarios locales, autoguardado) están gateados por la misma fuente de verdad (`canvasSession.ts`). Los accesos restantes son de solo lectura o están atados a una acción explícita del usuario sobre contenido físicamente visible/seleccionado, no a inferencia de identidad de diagrama.

---

## 10. Verificación

- `npx tsc --noEmit -p .` → **limpio**, exit 0 (verificado antes y después de la segunda pasada del §10.1).
- `npm run build` → **build de producción exitoso** (Vite + tsc -b), repetido tras cada tanda de cambios.
- `npm run lint` → falla por config ausente (`eslint.config.js` no existe en el repo) — **preexistente, no relacionado con este fix**.

**Pendiente de verificación manual/QA:**
- Reproducir el escenario original (cambio rápido de pestañas con latencia de red, y con varios usuarios en diferentes diagramas del mismo proyecto) para confirmar ausencia de pools superpuestos.
- Recomendado: test de integración que inyecte latencia artificial en `loadYjsState`/`importXml` para reproducir la carrera de forma determinista en CI (la carrera original no es reproducible de forma confiable a mano).

---

## 11. Patrón reutilizable para otros proyectos

### Cuándo aplica

Cualquier app con **un canvas/editor compartido reutilizado entre distintos documentos** (no uno nuevo por documento) que además tenga **un sistema async independiente que se adjunta a ese canvas** (colaboración en tiempo real, autosave, analíticas, validación en background). Si el sistema independiente decide "¿puedo actuar ya?" mirando el *contenido actual* del canvas en vez de una *señal explícita de identidad confirmada*, existe esta clase de bug.

### Checklist de diagnóstico

1. ¿Hay un solo canvas/editor reutilizado entre "documentos" (tabs, diagramas, hojas)?
2. ¿Algún sistema paralelo decide su propio arranque preguntando "¿tiene contenido?" / "¿está montado?" en vez de "¿el documento X específico ya cargó, confirmado?"
3. ¿Ese sistema paralelo se dispara por un `useEffect`/listener con las mismas dependencias que el cambio de documento, pero de forma independiente al código que hace el `load`/`import` real?
4. Si sí a las tres: la condición de carrera existe, sea o no reproducible fácilmente (depende de latencia).

### El fix en forma portable (fencing token)

```javascript
// Módulo compartido — una sola generación global para "qué documento está confirmado".
let generation = 0
let readyDocId = null
let readyGeneration = -1

function beginLoad() {
  generation += 1
  readyDocId = null
  return generation
}

function completeLoad(token, docId) {
  if (token !== generation) return   // superado por una carga posterior: descartar
  readyDocId = docId
  readyGeneration = token
}

function isReadyFor(docId) {
  return readyDocId === docId && readyGeneration === generation
}
```

- El único call site que hace el `load`/`import` real reclama el token al empezar y lo confirma al terminar.
- Cualquier otro sistema que necesite tocar el canvas espera `isReadyFor(docId)` antes de actuar — nunca infiere disponibilidad de heurísticas sobre el contenido.
- Ante timeout esperando confirmación: **fallar cerrado** (deshabilitar esa función, loguear) en vez de forzar la acción sobre un estado no confirmado.

---

## 12. Relación con incidentes previos (GhostPool)

Los commits `fix-GhostPool-v2` (50ed917) y `fix-GhostPool-mc-modeler-side` (e9a9db2) resolvieron un problema distinto: el pipeline de import/export XPDL de Bizagi generaba un pool contenedor vacío ("Proceso principal") como artefacto del formato. Ese fix vive en `src/utils/bpmImport.ts`/`bpmExport.ts` y no tiene relación de código ni de mecanismo con este incidente — la coincidencia es solo en el término coloquial "pool fantasma" usado para describir el síntoma, no en la causa. Este incidente es enteramente nuevo: una condición de carrera en la orquestación de colaboración en tiempo real, expuesta (no introducida) por el crecimiento de tráfico Realtime en uso multiusuario.
