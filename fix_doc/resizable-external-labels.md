# Feature/Fix: Labels externos redimensionables con snap-to-content

**Tipo:** Feature + decisiones de diseño (ADR ligero)
**Archivos:** `src/bpmn/elements/ResizableLabelsModule.ts` (nuevo), `src/bpmn/rendering/ThemeAwareRenderer.ts`, `src/bpmn/config.ts`, `src/utils/bpmExport.ts`
**Fecha:** 2026-07-07
**Estado:** Implementado y probado (build + 59 tests, 6 propios del módulo)
**Pendiente relacionado:** tamaño de tipografía global/por-elemento (el usuario lo pospuso explícitamente; ver §8)

---

## 1. Problema

Los labels externos (texto de eventos, gateways y sequence flows — p. ej. el texto condicional de un gateway) tenían tamaño fijo: bpmn-js los envuelve a **90px de ancho** siempre. No se podían redimensionar y el texto largo quedaba en columna angosta de muchas líneas. Se necesitaba: redimensionarlos como cualquier shape, que el texto refluya al ancho elegido, y que el tamaño persista en todas las exportaciones (.bpmn, SVG/PNG, .bpm Bizagi).

## 2. Por qué bpmn-js lo bloquea — 3 capas independientes

Cualquier solución parcial falla; hay que cubrir las tres:

1. **Reglas.** `BpmnRules.canResize()` devuelve `false` para labels. Además nuestro `CustomResizeModule` los excluía explícitamente (`element.labelTarget` → return false). Sin regla no hay handles.
2. **Render.** `BpmnRenderer.renderExternalLabel` (bpmn-js 18.15, línea ~1077) usa caja fija `{width: 90, height: 30}` e **ignora** `element.width/height`. Aunque el shape cambie de tamaño, el texto no refluye.
3. **Re-layout automático.** `textRenderer.getExternalLabelBounds()` re-envuelve el texto a 90px fijos y lo llaman TRES paths que destruirían cualquier tamaño manual:
   - `UpdateLabelHandler.postExecute` — rename inline (doble click)
   - `UpdatePropertiesHandler` — rename por panel de propiedades
   - `BpmnImporter.addLabel` — **cada carga del XML** re-layouta aunque el DI traiga bounds

## 3. Solución — `ResizableLabelsModule.ts`

Cinco servicios en un módulo:

| Servicio | Qué hace |
|---|---|
| `LabelResizeRules` | `shape.resize`/`elements.resize` prioridad **9000** (CustomResizeModule=10000 devuelve `undefined` para labels y cae aquí; BpmnRules=1000 nunca llega). Mín 30×14. |
| `LabelBoundsPatch` | Monkey-patch a `textRenderer.getExternalLabelBounds` (servicio DI). Cubre rename y también import. |
| `LabelSnapBehavior` | `CommandInterceptor.preExecute('shape.resize')`: reescribe `context.newBounds` con el snap-to-content. Un solo comando, sin recursión. Idempotente. |
| `LabelEditingBoxPatch` | Monkey-patch a `LabelEditingProvider.getEditingBBox`: la caja de edición inline usa el ancho real del label (base hardcodea 90px). |
| `LabelResizePreview` | Reflow en vivo + marco cuantizado durante el drag (ver §5). |

Más la rama de labels en `ThemeAwareRenderer.drawShape` (antes su `canRender` los excluía): renderiza con `textRenderer.createText` usando `box = element.width/height`, `align: 'center-middle'`, `fitBox: true`. El color lo pone el CSS del tema (`.djs-label text { fill: var(--text) !important }` en `index.css:611`); el fill inline usa `getLabelColor` respetando color DI (importa para el SVG exportado, donde el CSS no viaja).

## 4. Decisión clave 1 — Heurística "ancho > 90 = tamaño manual" (sin flag moddle)

`getExternalLabelBounds(bounds, text)` no recibe el elemento en el path de import (rect plano sin `businessObject`), así que un flag moddle **no puede** cubrir ese path. En su lugar:

- El auto-layout de bpmn-js **nunca** produce ancho > 90. Por tanto ancho > 90 ⟺ resize manual (o DI persistido de uno).
- `bounds.labelTarget` presente ⟺ path vivo (rename); ausente ⟺ path de import → se honra el DI **verbatim** (WYSIWYG al recargar).
- Propiedad greedy que hace esto consistente: si todas las líneas de un texto envuelto a W caben en W' ≤ W, envolver a W' produce las mismas líneas → re-snapear es no-op.

**Limitación asumida y documentada:** angostar un label por debajo de 90px no sobrevive al siguiente rename/recarga (vuelve al auto-layout). El caso de uso real es ensanchar.

## 5. Decisión clave 2 — Snap-to-content en vez de justificado

Evolución en 3 iteraciones con feedback del usuario:

1. **v1 — caja libre:** la caja quedaba del tamaño arrastrado → quedaba espacio en blanco lateral cuando la siguiente palabra no cabía (wrap greedy por palabras enteras, no se cortan). Usuario lo rechazó.
2. **Justificado (estilo Word) — evaluado y descartado:** `textLength + lengthAdjust` de SVG estira espacio entre **letras**, no entre palabras (`e s p a c i a d o`). El justificado real requiere tspan por palabra con medición manual; y estética con huecos irregulares. El usuario prefirió centrado.
3. **v2 — snap-to-content (implementado):** el drag no fija el tamaño de la caja, fija el **ancho de quiebre** del texto. Al soltar, la caja se ciñe al bloque resultante (línea más larga × alto de líneas). Nunca hay espacio en blanco; el texto queda centrado con espaciado natural. Consecuencia: el alto es siempre automático (redimensionar verticalmente no hace nada), y no se puede dejar "aire" alrededor del texto.

## 6. Decisión clave 3 — Marco cuantizado en vivo (percepción del snap)

Problema reportado: "trato de agrandar y no permite, vuelve a como estaba, brusco". Causa: entre umbrales de reflow el ancho ceñido no cambia → al soltar la caja "rebotaba" al tamaño previo.

Fix: el listener de `resize.move` entra a **prioridad 750** — después de que `Resize.handleMove` (1000) computa `context.newBounds`, antes de que `ResizePreview` (500) dibuje el marco — y reescribe `context.newBounds` con el snap. Así:

- El marco punteado solo salta entre anchos válidos durante el drag (feedback inmediato de la regla).
- `resize.end` aplica exactamente lo que se ve → cero salto al soltar.

**Anclaje:** siempre al **centro del label original** (`prev = shape`), no al rect arrastrado — anclar al drag rect haría derivar la caja hacia el handle. La caja crece simétrica desde su centro. Si molesta, la mejora sería anclaje direccional según handle ('e' → borde izq. fijo, 'w' → borde der. fijo), cuidando que `LabelSnapBehavior` no re-ancle distinto al soltar (hoy es consistente porque todos usan centro).

## 7. Persistencia / exportación

- **XML .bpmn:** gratis — `BpmnUpdater` de bpmn-js escribe `<bpmndi:BPMNLabel><dc:Bounds>` en cada `resizeShape` de label.
- **SVG/PNG:** heredan del render (saveSVG serializa el SVG del canvas).
- **.bpm Bizagi:** `bpmExport.ts::externalLabel()` recibía `labelBounds` del DI y **los ignoraba** (`_lb`, hardcodeaba 90×30) → ahora los usa (redondeados a entero, cf. `bug-export-bpm-int32.md`); fallback al comportamiento anterior si no hay `BPMNLabel`.
- **Colaboración:** labels están **excluidos** del sync Yjs (`SKIP_TYPES = ['label']` en `yBpmnModel.ts`) — mover un label tampoco sincronizaba antes; el resize hereda esa limitación. Si algún día se sincronizan labels, el resize viaja igual que el move (mismo snapshot x/y/width/height).

## 7b. Fix derivado — inconsistencias entre labels de shapes y de flechas (2026-07-08)

Síntoma reportado: el label de un gateway y el de una flecha "se veían distintos" al seleccionarlos.

Diagnóstico en dos partes (con corrección de rumbo tras feedback del usuario):

1. **Los labels externos comparten `businessObject` con su elemento padre** →
   en `CustomSelectionModule`, `isGateway(labelDeGateway) === true`. El label de
   gateway heredaba: clase `.djs-shape--gateway` (outline punteado ámbar), halo,
   y el filtro que oculta handles laterales. El de flecha (bo = SequenceFlow) no.
   - Outline punteado del color del tipo + halo: **DESEADO por el usuario**
     (comunica a qué elemento pertenece el label) — se conservan.
   - Filtro de handles laterales: **bug real** — bloqueaba los handles e/w del
     label (justo los útiles para ensanchar). Guard `element.labelTarget` SOLO
     en `NonRectangularResizeFilter`.
   - Regla a recordar: cualquier clasificación por `businessObject.$instanceOf`
     alcanza también a los labels; decidir caso por caso si es deseado.

2. **La inconsistencia real era el espacio muerto**: labels legacy (v1 pre-snap)
   persistieron cajas más anchas que su texto; el import las honraba verbatim →
   caja con aire alrededor del texto. Fix: `LabelImportNormalizer` — en
   `import.done`, todo label >90px se re-ciñe a su texto (snapToContent,
   idempotente). Mutación DIRECTA (sin command stack): no ensucia undo ni marca
   dirty al abrir; actualiza `label.di.label.bounds` a mano para que
   saveXML/exports serialicen la caja ceñida. Nota: esto matiza el §4 — el DI
   se honra verbatim en `getExternalLabelBounds` (path import) para conservar
   el ancho de quiebre, y el normalizador ciñe después.

Comportamiento por diseño (confirmado con usuario): un label de UNA sola
palabra corta ("MC") tiene un único tamaño válido — la caja siempre abraza el
texto, arrastrar no lo agranda ni encoge. Si algún día se quiere "aire"
configurable, sería un padding opcional en snapToContent.

## 7c. Fix derivado — texto pegado a la izquierda (bug fitBox de diagram-js)

Síntoma: texto del label pegado al borde izquierdo con aire a la derecha cuando
la caja es más ancha que el texto (visible en labels legacy no ceñidos).

Causa (diagram-js `Text.js::layoutText`): con `fitBox: true` el centrado
HORIZONTAL se calcula contra `maxLineWidth` (el bloque de texto), no contra la
caja → la línea más larga siempre queda en x=0. El centrado vertical sí usa
`box.height`. `fitBox: false` no es alternativa: activa `shortenLine` y trunca
palabras más largas que la caja.

Fix: `createCenteredLabelText()` (exportado de `ResizableLabelsModule`) — crea
el texto con fitBox:true y aplica el centrado horizontal manualmente via
`transform: translate((boxW - dims.width)/2, 0)`. Lo usan el render
(ThemeAwareRenderer) y el preview de drag (que COMPONE su propio translate de
offset con el del centrado — ojo al orden). Además `LabelImportNormalizer` se
extendió a TODOS los labels externos (no solo >90) para ceñir también legacy
angostos con caja más ancha que su texto.

## 8. Pendientes / trampas para el futuro

- **Tipografía** (global y por elemento): pospuesta por el usuario. Global = `MODELER_CONFIG → textRenderer: { defaultStyle/externalStyle: { fontSize } }`. Por elemento = extensión moddle `flujo:fontSize` + renderer + panel. **Ojo:** cambiar fontSize invalida los anchos ceñidos persistidos (el texto medirá distinto) — al implementarlo, considerar re-snap al importar.
- La medición usa `TextUtil` de diagram-js (SVG offscreen, necesita DOM) → los tests unitarios solo cubren las ramas sin DOM (delegación ≤90, import verbatim, reglas). Vitest corre en env node sin jsdom.
- `LabelResizePreview` limpia `.djs-visual` y lo repuebla en cada move; en `resize.end`/`cancel` restaura con `graphicsFactory.update` — necesario porque si el drag no cambia bounds (o se cancela), el comando nunca corre y el preview quedaría huérfano.
- Cuidado con `YjsBpmnBinding`: tiene interceptor de `commandStack.changed` a prioridad 5000 por el bug de typing colaborativo (cf. `collab-typing-concurrency-fix.md`). Este módulo no toca ese canal, pero cualquier cambio futuro que dispare comandos durante `directEditing` debe revisarlo.
- Lint del proyecto roto (ESLint 9 sin `eslint.config.js`) — pre-existente, no relacionado.
