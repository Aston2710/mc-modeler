/**
 * ConnectionEndpointCirclesModule
 *
 * Renders Bizagi-style endpoint circles at connection start/end points.
 *
 * Key design decisions:
 * - Circles live in the SVG 'labels' layer (above shapes), so they render as
 *   full circles, not half-circles cut off by the shape fill.
 * - Circles are ONLY drawn for the currently selected connection(s).
 *   They disappear on deselection — zero visual noise on an idle diagram.
 * - On commandStack.changed the circles are refreshed so they follow
 *   element moves and waypoint edits without going stale.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const CIRCLE_RADIUS = 5
const CIRCLE_STROKE_WIDTH = 1.5
const LAYER_PRIORITY = 2   // same priority as labels layer in diagram-js

function getStrokeColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim() || '#475467'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConnectionEndpointCirclesBehavior(eventBus: any, canvas: any, bendpointMove: any) { // fixed (BUG-08)
  // One <g> inside the labels layer — we clear & repopulate on each selection change.
  // Using the labels layer ensures the circles render above shapes.
  let circlesGroup: SVGGElement | null = null

  function ensureGroup(): SVGGElement {
    if (!circlesGroup) {
      // diagram-js Canvas.getLayer(name, priority) → creates/returns a sub-layer
      const labelsLayer: SVGGElement = canvas.getLayer('connection-endpoints', LAYER_PRIORITY)
      circlesGroup = document.createElementNS(SVG_NS, 'g') as SVGGElement
      circlesGroup.setAttribute('class', 'djs-connection-endpoint-circles')
      labelsLayer.appendChild(circlesGroup)
    }
    return circlesGroup
  }

  function clearCircles() {
    const g = circlesGroup
    if (!g) return
    while (g.firstChild) g.removeChild(g.firstChild)
  }

  function addCircle(g: SVGGElement, x: number, y: number, onMouseDown: (e: MouseEvent) => void) {
    const c = document.createElementNS(SVG_NS, 'circle') as SVGCircleElement
    c.setAttribute('cx', String(x))
    c.setAttribute('cy', String(y))
    c.setAttribute('r', String(CIRCLE_RADIUS))
    c.setAttribute('fill', 'white')
    c.setAttribute('stroke', getStrokeColor())
    c.setAttribute('stroke-width', String(CIRCLE_STROKE_WIDTH))
    c.setAttribute('pointer-events', 'all') // permite que el círculo reciba eventos del mouse (fixed BUG-08)
    c.style.cursor = 'grab'
    c.addEventListener('mousedown', onMouseDown)
    g.appendChild(c)
  }

  function redraw(selectedElements: unknown[]) {
    clearCircles()
    if (!selectedElements || selectedElements.length === 0) return

    const g = ensureGroup()

    for (const el of selectedElements) {
      const conn = el as any
      const wps: Array<{ x: number; y: number }> | undefined = conn.waypoints
      if (!wps || wps.length < 2) continue

      // Círculo de inicio
      addCircle(g, wps[0].x, wps[0].y, (e: MouseEvent) => {
        e.stopPropagation()
        bendpointMove.start(e, conn, 0)
      })

      // Círculo de fin
      addCircle(g, wps[wps.length - 1].x, wps[wps.length - 1].y, (e: MouseEvent) => {
        e.stopPropagation()
        bendpointMove.start(e, conn, wps.length - 1)
      })
    }
  }

  // Track the current selection so we can refresh after element moves
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentSelection: any[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('selection.changed', (event: any) => {
    currentSelection = event.newSelection || []
    redraw(currentSelection)
  })

  // Refresh after any command (element moved, waypoints updated, etc.)
  eventBus.on('commandStack.changed', () => {
    if (currentSelection.length > 0) {
      redraw(currentSelection)
    }
  })

  // Clear on diagram destroy / import
  eventBus.on(['diagram.destroy', 'import.render.start'], () => {
    clearCircles()
    currentSelection = []
  })
}

//ConnectionEndpointCirclesBehavior.$inject = ['eventBus', 'canvas']
ConnectionEndpointCirclesBehavior.$inject = ['eventBus', 'canvas', 'bendpointMove'] // fixed (BUG-08)

export default {
  __init__: ['connectionEndpointCirclesBehavior'],
  connectionEndpointCirclesBehavior: ['type', ConnectionEndpointCirclesBehavior],
}
