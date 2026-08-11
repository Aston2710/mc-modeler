# Comentarios Colaborativos — Implementación

## Idea central
Comentarios "out-of-band": nunca tocan el XML/SVG de bpmn-js. Viven en un segundo CRDT (`Y.Map('comments')`) paralelo al diagrama. Ancla = `elementId` de bpmn-js (UUID estable). El pin flota sobre el canvas como overlay React absoluto.

---

## Arquitectura

```
canvas-wrap (position:relative)
 ├── bpmn-js SVG          ← intocable
 ├── CommentsOverlay      ← pines absolutos, pointer-events:none wrapper
 └── CommentsPanel        ← sidebar + toggle btn, z-index 20
```

```
yjsDoc
 ├── getMap('elements')   ← diagrama CRDT existente
 └── getMap('comments')   ← segundo CRDT (YjsCommentBinding)
       └── threadId → Y.Map
             ├── anchor   : JSON { type:'element'|'canvas', elementId|x,y }
             ├── status   : 'open'|'resolved'
             ├── orphaned : boolean
             ├── replies  : Y.Array<Reply>
             └── metadata : createdBy, createdByName, createdAt
```

Flujo de datos unidireccional:
`Yjs Y.Map` → `observeDeep` → `useCommentStore.syncFromYjs()` → React render

Mutaciones: componentes llaman `getCommentBinding()?.createThread/addReply/resolveThread` → escribe a Yjs → observer dispara → store actualiza.

---

## Archivos creados

| Archivo | Función |
|---|---|
| `src/store/commentStore.ts` | Zustand store + `getCommentBinding()` module ref |
| `src/collab/YjsCommentBinding.ts` | CRDT binding, orphan detection, mutaciones |
| `src/hooks/useCommentSetup.ts` | Hook siempre activo, Y.Doc local + localforage |
| `src/bpmn/elements/CommentContextPadModule.ts` | Botón speech bubble en context pad bpmn-js |
| `src/components/comments/CommentsOverlay.tsx` | Pines sobre SVG, recalculados en `canvas.viewbox.changed` |
| `src/components/comments/CommentsPanel.tsx` | Sidebar: threads, replies, composer, tabs open/resolved/all |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/bpmn/config.ts` | +`CommentContextPadModule` |
| `src/components/canvas/BpmnCanvas.tsx` | +`useCommentSetup`, +overlay, +panel, +listener `bpmn:comment:create` |
| `src/index.css` | +sección `Comments System` con clases temadas (`var(--panel)`, `var(--accent)`, etc.) |

---

## Cómo funciona end-to-end

1. `useCommentSetup(modelerRef)` corre siempre (no requiere Supabase). Crea `Y.Doc` local, carga desde `localforage['mc-comments:<diagramId>']`, inicia `YjsCommentBinding`.
2. Click botón en context pad → dispatcha `CustomEvent('bpmn:comment:create', {elementId})` → BpmnCanvas escucha → abre composer en panel.
3. Submit composer → `YjsCommentBinding.createThread()` → Yjs transact → `observeDeep` → Zustand sync → pin renderizado en overlay.
4. Pin click → `setActiveThread + setPanelOpen` → thread expandido en sidebar.
5. `commandStack.changed` → `checkOrphans()`: si elemento fue eliminado → `orphaned: true` → pin desaparece, badge "Eliminado" en sidebar. Undo → flag se limpia.
6. Persistencia: cada `doc.on('update')` → `localforage.setItem(...)`.

## Theming

Todos los colores usan CSS variables del tema (`var(--panel)`, `var(--bg-2)`, `var(--border)`, `var(--text)`, `var(--accent)`, `var(--primary)`). Light/dark mode automático. Sin clases Tailwind de color.

---

## Lo que falta

### 1. Sync colaborativo (crítico si se usa en collab)
El `Y.Doc` de comentarios es **local solamente**. No se broadcast por Supabase. Para habilitarlo:
- En `useCollab.ts`: pasar el mismo `doc` a `YjsCommentBinding` en lugar de crear uno nuevo en `useCommentSetup`
- O extender `CollabChannel` para broadcast de un segundo doc de comentarios
- El Y.Doc ya está estructurado como CRDT — upgrade es straightforward

### 2. Comentarios flotantes (canvas anchor)
- Tipo `{type:'canvas', x, y}` existe en modelo y binding
- Falta: disparador UI (propuesto: Shift+Click en canvas vacío)
- Fix: en BpmnCanvas escuchar click con Shift → `openComposer({type:'canvas', x, y})`

### 3. Scroll-to-thread
- Pin click abre panel pero no hace scroll al hilo activo
- Fix: `useEffect` en CommentsPanel con `scrollIntoView` cuando `activeThreadId` cambia

### 4. No probado en browser
- TypeScript compila limpio (0 errores)
- Smoke test visual pendiente
