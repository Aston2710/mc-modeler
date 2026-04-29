/**
 * CustomSelectionModule.ts
 *
 * Dos responsabilidades:
 *
 * 1. ShapeClassifier — añade clases CSS al GFX de cada shape según su tipo:
 *      .djs-shape--gateway
 *      .djs-shape--event  +  .djs-shape--start-event / --end-event / --intermediate-event
 *    Esto permite que el CSS oculte los handles N/S/E/W en elementos no rectangulares
 *    y aplique el color de contorno correcto por tipo.
 *
 * 2. SelectionHalo — inyecta un <rect class="djs-selection-halo"> al inicio del GFX
 *    para eventos y gateways. El rect se muestra/oculta con CSS según la clase .selected.
 *    Al estar prepended (primer hijo del GFX), renderiza detrás del elemento.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const SVG_NS = 'http://www.w3.org/2000/svg'
const HALO_PADDING = 8   // px fuera de los bounds del elemento

// ── Helpers de tipo ─────────────────────────────────────────────────────────

function isGateway(el: AnyObj): boolean {
  return !!el?.businessObject?.$instanceOf?.('bpmn:Gateway')
}

function isStartEvent(el: AnyObj): boolean {
  return !!el?.businessObject?.$instanceOf?.('bpmn:StartEvent')
}

function isEndEvent(el: AnyObj): boolean {
  return !!el?.businessObject?.$instanceOf?.('bpmn:EndEvent')
}

function isEvent(el: AnyObj): boolean {
  return !!el?.businessObject?.$instanceOf?.('bpmn:Event')
}

function isNonRectangular(el: AnyObj): boolean {
  return isEvent(el) || isGateway(el)
}

// ── ShapeClassifier ─────────────────────────────────────────────────────────

function ShapeClassifier(eventBus: AnyObj) {
  function classify(element: AnyObj, gfx: SVGElement) {
    if (!gfx || !element?.businessObject) return

    if (isGateway(element)) {
      gfx.classList.add('djs-shape--gateway')
    } else if (isStartEvent(element)) {
      gfx.classList.add('djs-shape--event', 'djs-shape--start-event')
    } else if (isEndEvent(element)) {
      gfx.classList.add('djs-shape--event', 'djs-shape--end-event')
    } else if (isEvent(element)) {
      // IntermediateCatchEvent, IntermediateThrowEvent, BoundaryEvent, etc.
      gfx.classList.add('djs-shape--event', 'djs-shape--intermediate-event')
    }
  }

  eventBus.on('shape.added',   ({ element, gfx }: AnyObj) => classify(element, gfx))
  // Re-apply after re-renders (cambio de tema, etc.)
  eventBus.on('shape.changed', ({ element, gfx }: AnyObj) => classify(element, gfx))
}

ShapeClassifier.$inject = ['eventBus']

// ── SelectionHalo ───────────────────────────────────────────────────────────
//
// BUG que evitamos: diagram-js GraphicsFactory.getVisual() usa childNodes[0]
// para encontrar el grupo .djs-visual. Si insertamos el halo como primer hijo
// del GFX outer, getVisual() devuelve el halo en lugar de .djs-visual, el
// redibujado en cambio de tema dibuja dentro del halo (que SVG ignora) y el
// .djs-visual queda congelado con los colores del tema anterior.
//
// Solución: escuchar render.shape a prioridad baja (100), que se dispara
// DESPUÉS de que el renderer ha dibujado dentro de .djs-visual (que es el
// parámetro `gfx` del evento). El .djs-visual se limpia en cada re-render,
// así que re-inyectamos el halo como primer hijo del .djs-visual en cada
// render — siempre detrás del contenido del elemento.

function SelectionHalo(eventBus: AnyObj) {
  function injectHalo(element: AnyObj, visual: SVGElement) {
    if (!visual || !isNonRectangular(element)) return

    // Crear siempre nuevo (visual se vacía en cada render)
    const halo = document.createElementNS(SVG_NS, 'rect') as SVGRectElement
    halo.classList.add('djs-selection-halo')

    const p = HALO_PADDING
    halo.setAttribute('x',      String(-p))
    halo.setAttribute('y',      String(-p))
    halo.setAttribute('width',  String(element.width  + p * 2))
    halo.setAttribute('height', String(element.height + p * 2))
    halo.setAttribute('rx', '4')
    halo.setAttribute('ry', '4')

    // Primer hijo de .djs-visual → renderiza detrás del visual del elemento
    visual.insertBefore(halo, visual.firstChild)
  }

  // render.shape: `gfx` aquí es el grupo .djs-visual (no el outer GFX)
  // Prioridad 100 < 1500 (ThemeAwareRenderer) → corre después del render
  eventBus.on('render.shape', 100, ({ gfx: visual, element }: AnyObj) => {
    injectHalo(element, visual)
  })
}

SelectionHalo.$inject = ['eventBus']

// ── NonRectangularResizeFilter ──────────────────────────────────────────────
//
// Los resize handles NO están dentro del GFX del shape — van a su propia capa
// `canvas.getLayer('resizers')`. El CSS no puede relacionarlos con el tipo de shape.
// Solución: interceptar selection.changed a prioridad 500 (DESPUÉS de ResizeHandles
// que escucha a prioridad 1000) y ocultar los 4 handles laterales en esa capa.

const SIDE_DIRS = ['n', 's', 'e', 'w']

function NonRectangularResizeFilter(eventBus: AnyObj, canvas: AnyObj, selection: AnyObj) {
  function hideSideHandles(element: AnyObj) {
    if (!isNonRectangular(element)) return

    const layer: SVGElement | null = canvas.getLayer('resizers')
    if (!layer) return

    SIDE_DIRS.forEach(dir => {
      layer.querySelectorAll('.djs-resizer-' + dir).forEach((h: Element) => {
        ;(h as SVGElement).style.display = 'none'
      })
    })
  }

  // Prioridad 500 < 1000 → corre DESPUÉS de que ResizeHandles crea los handles
  eventBus.on('selection.changed', 500, function(e: AnyObj) {
    const { newSelection } = e
    if (newSelection.length === 1) hideSideHandles(newSelection[0])
  })

  // Al hacer resize, ResizeHandles recrea los handles → volver a ocultarlos
  eventBus.on('shape.changed', 500, function(e: AnyObj) {
    if (selection.isSelected(e.element)) hideSideHandles(e.element)
  })
}

NonRectangularResizeFilter.$inject = ['eventBus', 'canvas', 'selection']

// ── Módulo bpmn-js ──────────────────────────────────────────────────────────

const CustomSelectionModule = {
  __init__: ['shapeClassifier', 'selectionHalo', 'nonRectangularResizeFilter'],
  shapeClassifier:           ['type', ShapeClassifier],
  selectionHalo:             ['type', SelectionHalo],
  nonRectangularResizeFilter:['type', NonRectangularResizeFilter],
}

export default CustomSelectionModule
