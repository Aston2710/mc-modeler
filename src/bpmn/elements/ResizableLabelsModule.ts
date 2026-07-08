/**
 * ResizableLabelsModule.ts
 *
 * Permite redimensionar los labels externos (eventos, gateways, conexiones)
 * como cualquier shape, con el texto refluyendo al ancho elegido.
 *
 * bpmn-js bloquea esto en 3 capas; este módulo cubre 2 y ThemeAwareRenderer la 3ª:
 *
 *  1. REGLAS  — BpmnRules.canResize() devuelve false para labels y
 *     CustomResizeModule los excluye. Aquí: regla shape.resize/elements.resize
 *     a prioridad 9000 (entre CustomResizeModule 10000, que devuelve undefined
 *     para labels, y BpmnRules 1000).
 *
 *  2. RE-LAYOUT AUTOMÁTICO — textRenderer.getExternalLabelBounds() re-envuelve
 *     el texto a 90px fijos. Lo llaman: UpdateLabelHandler (rename inline),
 *     UpdatePropertiesHandler (rename por panel) y BpmnImporter.addLabel (carga
 *     del XML). Cualquier tamaño manual se perdería. Aquí: patch sobre el
 *     servicio textRenderer.
 *
 *  3. RENDER — BpmnRenderer.renderExternalLabel usa caja fija 90×30 ignorando
 *     element.width/height. Lo resuelve ThemeAwareRenderer (rama labelTarget).
 *
 * HEURÍSTICA "tamaño manual": ancho > 90px. El auto-layout de bpmn-js envuelve
 * a 90px máximo, así que un ancho mayor solo puede venir de un resize del
 * usuario (o de un DI persistido con ese resize). Evita necesitar un flag
 * moddle y funciona también en el path de importación, donde solo se dispone
 * de un rect plano sin businessObject.
 * Limitación asumida: angostar un label por debajo de 90px no sobrevive al
 * siguiente rename/recarga (vuelve al auto-layout de 90px).
 *
 * SNAP-TO-CONTENT: el arrastre de resize no fija el tamaño final de la caja,
 * fija el ANCHO DE QUIEBRE del texto. Al soltar, la caja se ciñe al bloque de
 * texto resultante (línea más larga × alto de líneas), conservando el centro
 * del área arrastrada. Así nunca queda espacio en blanco alrededor del texto
 * centrado. Se aplica reescribiendo context.newBounds en el preExecute del
 * comando shape.resize (un solo comando, sin recursión) — es idempotente:
 * re-envolver un texto a su propio ancho ceñido produce las mismas líneas.
 *
 * PREVIEW EN VIVO: diagram-js solo aplica resizeShape en resize.end; durante
 * el drag solo se ve el marco. LabelResizePreview re-dibuja el texto del label
 * en cada resize.move con los bounds candidatos.
 *
 * PERSISTENCIA: gratis — BpmnUpdater ya escribe los bounds del label en el DI
 * (<bpmndi:BPMNLabel><dc:Bounds>) al hacer resizeShape; saveXML/saveSVG los
 * conservan.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — diagram-js ships CommonJS without full types
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import TextUtil from 'diagram-js/lib/util/Text'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { getLabel } from 'bpmn-js/lib/util/LabelUtil'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

/** Ancho máximo del auto-layout de bpmn-js; por encima = tamaño manual. */
export const AUTO_WRAP_WIDTH = 90

const MIN_LABEL = { width: 30, height: 14 }

function isExternalLabel(el: AnyObj): boolean {
  return !!el && !!el.labelTarget
}

const sharedTextUtil = new TextUtil({})

/** Dimensiones del texto envuelto a `width` con el estilo de labels externos. */
function wrapDims(textRenderer: AnyObj, text: string, width: number): { width: number; height: number } {
  return sharedTextUtil.getDimensions(text, {
    box: { width, height: 30 },
    style: textRenderer.getExternalStyle(),
  })
}

/**
 * Bounds ceñidos al texto envuelto a `wrapWidth`, anclados al CENTRO de `prev`
 * (bounds previos del label). Anclar al centro del label original —no del rect
 * arrastrado— evita que la caja "derive" hacia el handle durante el drag.
 */
function snapToContent(textRenderer: AnyObj, text: string, wrapWidth: number, prev: AnyObj): AnyObj {
  const dims = wrapDims(textRenderer, text, wrapWidth)
  const w = Math.max(MIN_LABEL.width, Math.ceil(dims.width))
  const h = Math.max(MIN_LABEL.height, Math.ceil(dims.height))
  return {
    x: Math.round(prev.x + prev.width / 2 - w / 2),
    y: Math.round(prev.y + prev.height / 2 - h / 2),
    width: w,
    height: h,
  }
}

// ── 1. Reglas de resize para labels ────────────────────────────────────────
function LabelResizeRules(this: AnyObj, eventBus: AnyObj) {
  RuleProvider.call(this, eventBus)
}

inherits(LabelResizeRules, RuleProvider)

LabelResizeRules.$inject = ['eventBus']

LabelResizeRules.prototype.init = function () {
  this.addRule('shape.resize', 9000, function (context: AnyObj) {
    const { shape, newBounds } = context
    if (!isExternalLabel(shape)) return undefined // pasar a BpmnRules
    if (newBounds && (newBounds.width < MIN_LABEL.width || newBounds.height < MIN_LABEL.height)) {
      return false
    }
    return true
  })

  // Necesaria para que diagram-js muestre los handles de resize al seleccionar
  this.addRule('elements.resize', 9000, function (context: AnyObj) {
    const { elements } = context
    if (elements && elements.length === 1 && isExternalLabel(elements[0])) return true
    return undefined
  })
}

// ── 2. Patch de getExternalLabelBounds — preservar tamaño manual ───────────
function LabelBoundsPatch(textRenderer: AnyObj) {
  const original = textRenderer.getExternalLabelBounds.bind(textRenderer)

  textRenderer.getExternalLabelBounds = function (bounds: AnyObj, text: string) {
    const width = bounds?.width ?? 0
    if (!(width > AUTO_WRAP_WIDTH)) return original(bounds, text) // auto-layout normal

    // Path de importación (BpmnImporter pasa un rect plano, sin labelTarget):
    // el DI trae un tamaño manual persistido → honrarlo tal cual (WYSIWYG).
    if (!bounds.labelTarget) {
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    }

    // Rename de un label con ancho manual: re-envolver el nuevo texto al ancho
    // actual y ceñir la caja al resultado (snap-to-content), centro conservado.
    return snapToContent(textRenderer, text, width, bounds)
  }
}

LabelBoundsPatch.$inject = ['textRenderer']

// ── 2b. Snap-to-content al redimensionar ───────────────────────────────────
// El drag fija el ancho de quiebre; la caja final se ciñe al texto envuelto.
// preExecute reescribe context.newBounds ANTES de que ResizeShapeHandler
// aplique el resize → un solo comando, sin recursión. Idempotente para los
// resize programáticos que ya llegan ceñidos (rename, import).
function LabelSnapBehavior(this: AnyObj, eventBus: AnyObj, textRenderer: AnyObj) {
  CommandInterceptor.call(this, eventBus)

  this.preExecute(
    'shape.resize',
    1500,
    function (context: AnyObj) {
      const { shape, newBounds } = context
      if (!isExternalLabel(shape) || !newBounds) return
      const text = getLabel(shape)
      if (!text || !text.trim()) return
      context.newBounds = snapToContent(textRenderer, text, newBounds.width, shape)
    },
    true
  )
}

inherits(LabelSnapBehavior, CommandInterceptor)

LabelSnapBehavior.$inject = ['eventBus', 'textRenderer']

// ── 3. Patch del editing box inline — usar el ancho manual del label ───────
// LabelEditingProvider.getEditingBBox hardcodea 90px de ancho para labels
// externos; con un label ensanchado el textarea saldría angosto y el texto
// "saltaría" al entrar/salir de edición.
function LabelEditingBoxPatch(injector: AnyObj, canvas: AnyObj) {
  const provider = injector.get('labelEditingProvider', false)
  if (!provider) return

  const original = provider.getEditingBBox
  provider.getEditingBBox = function (element: AnyObj) {
    const context = original.call(this, element)
    const target = element.label || element
    if (isExternalLabel(target) && target.width > AUTO_WRAP_WIDTH) {
      const bbox = canvas.getAbsoluteBBox(target)
      context.bounds.x = bbox.x
      context.bounds.width = bbox.width
    }
    return context
  }
}

LabelEditingBoxPatch.$inject = ['injector', 'canvas']

// ── 4. Preview en vivo durante el drag de resize ───────────────────────────
// diagram-js solo ejecuta resizeShape en resize.end; durante el arrastre el
// elemento no cambia y solo se ve el marco. Aquí se re-dibuja el texto del
// label en cada resize.move con los bounds candidatos, y en end/cancel se
// restaura el render canónico via graphicsFactory.
function LabelResizePreview(
  eventBus: AnyObj,
  elementRegistry: AnyObj,
  graphicsFactory: AnyObj,
  textRenderer: AnyObj,
) {
  function previewText(shape: AnyObj, bounds: AnyObj) {
    const gfx = elementRegistry.getGraphics(shape)
    const visual: SVGElement | null = gfx?.querySelector('.djs-visual')
    if (!visual) return
    while (visual.firstChild) visual.removeChild(visual.firstChild)
    const text = textRenderer.createText(getLabel(shape) || '', {
      box: { width: bounds.width, height: bounds.height },
      align: 'center-middle',
      fitBox: true,
      style: textRenderer.getExternalStyle(), // fill lo pone el CSS del tema en canvas
    })
    text.setAttribute('class', 'djs-label')
    // El gfx está trasladado a (shape.x, shape.y); compensar si el drag mueve
    // el origen (handles izquierdo/superior).
    text.setAttribute('transform', `translate(${bounds.x - shape.x}, ${bounds.y - shape.y})`)
    visual.appendChild(text)
  }

  // Prioridad 750: DESPUÉS de Resize.handleMove (1000, computa newBounds) y
  // ANTES de ResizePreview (500, dibuja el marco). Al reescribir newBounds con
  // el snap aquí, el marco punteado se cuantiza en vivo a los anchos válidos y
  // resize.end aplica exactamente lo que se ve → sin salto brusco al soltar.
  eventBus.on('resize.move', 750, function (event: AnyObj) {
    const context = event.context ?? {}
    const { shape, newBounds } = context
    if (!isExternalLabel(shape) || !newBounds) return
    const text = getLabel(shape)
    if (text && text.trim()) {
      context.newBounds = snapToContent(textRenderer, text, newBounds.width, shape)
    }
    previewText(shape, context.newBounds)
  })

  eventBus.on(['resize.end', 'resize.cancel'], function (event: AnyObj) {
    const shape = event.context?.shape
    if (!isExternalLabel(shape)) return
    const gfx = elementRegistry.getGraphics(shape)
    if (gfx) graphicsFactory.update('shape', shape, gfx)
  })
}

LabelResizePreview.$inject = ['eventBus', 'elementRegistry', 'graphicsFactory', 'textRenderer']

// ── Módulo bpmn-js ──────────────────────────────────────────────────────────
const ResizableLabelsModule = {
  __init__: [
    'labelResizeRules',
    'labelBoundsPatch',
    'labelSnapBehavior',
    'labelEditingBoxPatch',
    'labelResizePreview',
  ],
  labelResizeRules: ['type', LabelResizeRules],
  labelBoundsPatch: ['type', LabelBoundsPatch],
  labelSnapBehavior: ['type', LabelSnapBehavior],
  labelEditingBoxPatch: ['type', LabelEditingBoxPatch],
  labelResizePreview: ['type', LabelResizePreview],
}

export default ResizableLabelsModule
