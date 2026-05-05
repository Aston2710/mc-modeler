/**
 * BizagiSegmentHandles — replaces diagram-js native `bendpoints` service.
 *
 * Changes from native Bendpoints.js:
 *  - No floating bendpoint → prevents click-to-add-point on empty segment area (fixes 2b)
 *  - No element.hover listener → handles appear only when selected, not on hover (fixes 2c)
 *  - No updateSegmentDraggerPosition call → segment bar stays fixed at midpoint (fixes 2a)
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { forEach } from 'min-dash'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { event as domEvent, query as domQuery, queryAll as domQueryAll } from 'min-dom'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { BENDPOINT_CLS, SEGMENT_DRAGGER_CLS, addBendpoint, addSegmentDragger, calculateSegmentMoveRegion, getConnectionIntersection } from 'diagram-js/lib/features/bendpoints/BendpointUtil'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { escapeCSS } from 'diagram-js/lib/util/EscapeUtil'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { pointsAligned, getMidPoint } from 'diagram-js/lib/util/Geometry'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { isPrimaryButton } from 'diagram-js/lib/util/Mouse'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { append as svgAppend, attr as svgAttr, classes as svgClasses, create as svgCreate, remove as svgRemove } from 'tiny-svg'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { translate } from 'diagram-js/lib/util/SvgTransformUtil'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiSegmentHandles(this: any, eventBus: any, canvas: any, interactionEvents: any, bendpointMove: any, connectionSegmentMove: any) {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isIntersectionMiddle(intersection: any, waypoints: any[], threshold: number): boolean {
    const idx = intersection.index
    const p = intersection.point
    if (idx <= 0 || intersection.bendpoint) return false
    const p0 = waypoints[idx - 1]
    const p1 = waypoints[idx]
    const mid = getMidPoint(p0, p1)
    const aligned = pointsAligned(p0, p1)
    const xDelta = Math.abs(p.x - mid.x)
    const yDelta = Math.abs(p.y - mid.y)
    return !!(aligned && xDelta <= threshold && yDelta <= threshold)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function calculateIntersectionThreshold(connection: any, intersection: any): number | null {
    const waypoints = connection.waypoints
    if (intersection.index <= 0 || intersection.bendpoint) return null
    const relevantSegment = {
      start: waypoints[intersection.index - 1],
      end: waypoints[intersection.index],
    }
    const alignment = pointsAligned(relevantSegment.start, relevantSegment.end)
    if (!alignment) return null
    const segmentLength = alignment === 'h'
      ? relevantSegment.end.x - relevantSegment.start.x
      : relevantSegment.end.y - relevantSegment.start.y
    return calculateSegmentMoveRegion(segmentLength) / 2
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function activateBendpointMove(event: any, connection: any): boolean | undefined {
    const waypoints = connection.waypoints
    const intersection = getConnectionIntersection(canvas, waypoints, event)
    if (!intersection) return

    // Si NO es una esquina (es decir, es la barra recta del segmento), permitir arrastre ortogonal
    if (!intersection.bendpoint) {
      connectionSegmentMove.start(event, connection, intersection.index)
      return true
    }

    // EXCEPCIÓN PARA CÍRCULOS BLANCOS: Si es un bendpoint, verificar si es el INICIO o el FIN
    if (intersection.bendpoint) {
      const isStart = intersection.index === 0
      const isEnd = intersection.index === waypoints.length - 1

      if (isStart || isEnd) {
        // Permitimos mover exclusivamente los orígenes y destinos (reconectar)
        bendpointMove.start(event, connection, intersection.index)
        return true
      }
    }
    
    // Prohibir la deformación libre 2D (pirámides) en las esquinas intermedias
    return false
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function bindInteractionEvents(node: any, eventName: string, element: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    domEvent.bind(node, eventName, function (event: any) {
      interactionEvents.triggerMouseEvent(eventName, event, element)
      event.stopPropagation()
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getBendpointsContainer(element: any, create?: boolean): any {
    const layer = canvas.getLayer('overlays')
    let gfx = domQuery('.djs-bendpoints[data-element-id="' + escapeCSS(element.id) + '"]', layer)
    if (!gfx && create) {
      gfx = svgCreate('g')
      svgAttr(gfx, { 'data-element-id': element.id })
      svgClasses(gfx).add('djs-bendpoints')
      svgAppend(layer, gfx)
      bindInteractionEvents(gfx, 'mousedown', element)
      bindInteractionEvents(gfx, 'click', element)
      bindInteractionEvents(gfx, 'dblclick', element)
    }
    return gfx
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getSegmentDragger(idx: number, parentGfx: any): any {
    return domQuery('.djs-segment-dragger[data-segment-idx="' + idx + '"]', parentGfx)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createBendpoints(gfx: any, connection: any) {
    // Vacío Intencionalmente.
    // Bizagi no renderiza "puntitos" verdes en las esquinas porque no permite
    // interactuar con ellas. Al dejar esto vacío, limpiamos la interfaz de basura visual.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createSegmentDraggers(gfx: any, connection: any) {
    const waypoints = connection.waypoints
    for (let i = 1; i < waypoints.length; i++) {
      const segmentStart = waypoints[i - 1]
      const segmentEnd = waypoints[i]
      if (pointsAligned(segmentStart, segmentEnd)) {
        const segmentDraggerGfx = addSegmentDragger(gfx, segmentStart, segmentEnd)
        svgAttr(segmentDraggerGfx, { 'data-segment-idx': i })
        bindInteractionEvents(segmentDraggerGfx, 'mousemove', connection)
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function clearBendpoints(gfx: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forEach(domQueryAll('.' + BENDPOINT_CLS, gfx), function (node: any) {
      svgRemove(node)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function clearSegmentDraggers(gfx: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forEach(domQueryAll('.' + SEGMENT_DRAGGER_CLS, gfx), function (node: any) {
      svgRemove(node)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function addHandles(connection: any): any {
    let gfx = getBendpointsContainer(connection)
    if (!gfx) {
      gfx = getBendpointsContainer(connection, true)
      createBendpoints(gfx, connection)
      createSegmentDraggers(gfx, connection)
    }
    return gfx
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateHandles(connection: any) {
    const gfx = getBendpointsContainer(connection)
    if (gfx) {
      clearSegmentDraggers(gfx)
      clearBendpoints(gfx)
      createSegmentDraggers(gfx, connection)
      createBendpoints(gfx, connection)
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('connection.changed', function (event: any) {
    updateHandles(event.element)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('connection.remove', function (event: any) {
    const gfx = getBendpointsContainer(event.element)
    if (gfx) svgRemove(gfx)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('element.marker.update', function (event: any) {
    const element = event.element
    if (!element.waypoints) return
    const bendpointsGfx = addHandles(element)
    if (event.add) {
      svgClasses(bendpointsGfx).add(event.marker)
    } else {
      svgClasses(bendpointsGfx).remove(event.marker)
    }
  })

  // No element.mousemove listener — segment dragger bar stays at midpoint.
  // Native Bendpoints.js calls updateSegmentDraggerPosition here which translates
  // the .djs-visual child to follow the cursor, causing the bar to jump around.

  // No element.hover listener — handles only appear on selection, not hover.
  // Native code adds handles on hover which shows segment draggers while
  // just moving the mouse over any connection.

  // No element.out listener — not needed without element.hover.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('element.mousedown', function (event: any) {
    if (!isPrimaryButton(event)) return
    const originalEvent = event.originalEvent
    const element = event.element
    if (!element.waypoints) return
    return activateBendpointMove(originalEvent, element)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('selection.changed', function (event: any) {
    const newSelection = event.newSelection
    const primary = newSelection[0]
    if (primary && primary.waypoints) {
      addHandles(primary)
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('element.updateId', function (context: any) {
    const element = context.element
    const newId = context.newId
    if (element.waypoints) {
      const bendpointContainer = getBendpointsContainer(element)
      if (bendpointContainer) {
        svgAttr(bendpointContainer, { 'data-element-id': newId })
      }
    }
  })

  // Public API — matches native Bendpoints so other services can call these
  this.addHandles = addHandles
  this.updateHandles = updateHandles
  this.getBendpointsContainer = getBendpointsContainer
  this.getSegmentDragger = getSegmentDragger
}

BizagiSegmentHandles.$inject = [
  'eventBus',
  'canvas',
  'interactionEvents',
  'bendpointMove',
  'connectionSegmentMove',
]

export default {
  bendpoints: ['type', BizagiSegmentHandles],
}
