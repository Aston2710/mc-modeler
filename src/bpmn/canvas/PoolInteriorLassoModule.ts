/**
 * PoolInteriorLassoModule.ts
 *
 * Comportamiento Bizagi-style para pools:
 * - Click en interior del pool → activa lasso selection
 * - Click en borde (~10px) o header strip (~30px) → selección/movimiento normal
 *
 * Prioridad 1100: después de CanvasLassoModule (1200, maneja root), antes de MoveCanvas (500).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const HEADER_WIDTH = 30  // px diagrama — franja del nombre del pool/lane
const BORDER_ZONE = 10   // px diagrama — zona de agarre en los bordes

function isPoolOrLane(element: AnyObj): boolean {
  const bo = element?.businessObject
  return !!(bo?.$instanceOf?.('bpmn:Participant') || bo?.$instanceOf?.('bpmn:Lane'))
}

function toDiagramCoords(ev: MouseEvent, canvas: AnyObj): { x: number; y: number } {
  const vb = canvas.viewbox()
  const rect = (canvas.getContainer() as HTMLElement).getBoundingClientRect()
  return {
    x: (ev.clientX - rect.left) / vb.scale + vb.x,
    y: (ev.clientY - rect.top) / vb.scale + vb.y,
  }
}

function onBorderOrHeader(cx: number, cy: number, el: AnyObj): boolean {
  const { x, y, width, height } = el

  const inBounds = cx >= x && cx <= x + width && cy >= y && cy <= y + height
  if (!inBounds) return false

  // Header: franja izquierda (nombre del pool/lane)
  if (cx <= x + HEADER_WIDTH) return true

  // Bordes: dentro de BORDER_ZONE px de cualquier arista
  if (
    cx <= x + BORDER_ZONE ||
    cx >= x + width - BORDER_ZONE ||
    cy <= y + BORDER_ZONE ||
    cy >= y + height - BORDER_ZONE
  ) return true

  return false
}

function PoolInteriorLasso(eventBus: AnyObj, lassoTool: AnyObj, canvas: AnyObj) {
  eventBus.on('element.mousedown', 1100, function (context: AnyObj) {
    const { element, originalEvent: ev } = context

    if (!ev || ev.button !== 0) return
    if (!isPoolOrLane(element)) return
    if (ev.shiftKey || ev.altKey) return

    const pt = toDiagramCoords(ev, canvas)

    // Click en borde o header → comportamiento default (seleccionar/mover pool)
    if (onBorderOrHeader(pt.x, pt.y, element)) return

    // Click en interior → activar lasso selection
    try {
      lassoTool.activateLasso(ev)
      return false // detiene propagación → MoveCanvas/Move no reciben el evento
    } catch {
      // lassoTool no disponible, dejar pasar
    }
  })
}

PoolInteriorLasso.$inject = ['eventBus', 'lassoTool', 'canvas']

const PoolInteriorLassoModule = {
  __init__: ['poolInteriorLasso'],
  poolInteriorLasso: ['type', PoolInteriorLasso],
}

export default PoolInteriorLassoModule
