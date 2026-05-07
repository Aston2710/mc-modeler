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
import { BENDPOINT_CLS, SEGMENT_DRAGGER_CLS, addSegmentDragger, calculateSegmentMoveRegion, getConnectionIntersection } from 'diagram-js/lib/features/bendpoints/BendpointUtil'
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiSegmentHandles(
    this: any, 
    eventBus: any, 
    canvas: any, 
    interactionEvents: any, 
    bendpointMove: any, 
    connectionSegmentMove: any,
    graphicsFactory: any,   // ← AÑADIR
) { 

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
    const totalSegments = waypoints.length - 1
    for (let i = 1; i < waypoints.length; i++) {
      // Solo crear dragger para segmentos intermedios (no el primero ni el último)
      // Igual que Bizagi: el primer y último segmento están anclados al shape
      // y no deben ser movibles independientemente
      if (i === 1 || i === totalSegments) continue
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

  eventBus.on('bendpoint.move.move', function (event: any) {  //FIX BUG-09
    const context = event.context
    const newWaypoints = context.newWaypoints
    if (!newWaypoints || newWaypoints.length < 2) return

    // Detectar si es endpoint por índice, no por context.type
    const isStart = context.bendpointIndex === 0
    const isEnd   = context.bendpointIndex === newWaypoints.length - 1
    if (!isStart && !isEnd) return  // es un bendpoint intermedio → no snap

    const hoverShape = context.hover
    if (!hoverShape || !hoverShape.width) return

    const idx = isStart ? 0 : newWaypoints.length - 1
    const cursorPoint = newWaypoints[idx]

    const snapped = snapToCardinal(hoverShape, cursorPoint)
    newWaypoints[idx] = { x: snapped.x, y: snapped.y, original: cursorPoint }
  })

  // Umbral en píxeles para cambiar de cardinal durante drag de segmento.
  // 0 = cambia en cuanto el punto previo cruza el centro del shape.
  // Valor positivo = requiere N píxeles adicionales más allá del centro.
  const SEGMENT_CARDINAL_SWITCH_THRESHOLD = 0
  
  // Prioridad 500: disparamos DESPUÉS del handler interno de bpmn-js (prioridad 1000).
  // bpmn-js reconstruye los waypoints y llama redrawConnection primero.
  // Nosotros corregimos los waypoints y llamamos redrawConnection de nuevo con la versión correcta.
  eventBus.on('connectionSegment.move.move', 500, function (event: any) {
    const context = event.context
    const connection = context.connection
    if (!connection?.source || !connection?.target) return
  
    // Las propiedades correctas del context según ConnectionSegmentMove.js:
    const segStartIdx = context.segmentStartIndex   // índice del waypoint INICIO del segmento
    const segEndIdx   = context.segmentEndIndex     // índice del waypoint FIN del segmento
    const origLen     = context.originalWaypoints?.length
    if (origLen == null) return
  
    const isFirstSeg = segStartIdx === 0
    const isLastSeg  = segEndIdx === origLen - 1
  
    // Solo actuar para el primer o último segmento (los adyacentes a src/tgt).
    // Para segmentos medios, bpmn-js mantiene la ortogonalidad correctamente.
    if (!isFirstSeg && !isLastSeg) return
  
    // Trabajar sobre connection.waypoints que bpmn-js ya actualizó en su handler
    const wps = connection.waypoints
    if (!wps || wps.length < 2) return
    const last = wps.length - 1
  
    let modified = false
  
    if (isLastSeg && connection.target?.width) {
      const tgt = connection.target
      const prevToEnd = wps[last - 1]
      const newCardinal = nearestCardinalWithThreshold(tgt, prevToEnd, SEGMENT_CARDINAL_SWITCH_THRESHOLD)
    
      // Sólo actualizar si el cardinal cambió para evitar redibujados innecesarios
      if (newCardinal.x !== wps[last].x || newCardinal.y !== wps[last].y) {
        wps[last] = { x: newCardinal.x, y: newCardinal.y }
      
        // Corregir el waypoint adyacente para mantener ortogonalidad:
        // Cardinal izquierdo/derecho (y == tgt.cy) → último segmento debe ser horizontal
        // Cardinal superior/inferior (x == tgt.cx) → último segmento debe ser vertical
        const tgtCy = tgt.y + tgt.height / 2
        const tgtCx = tgt.x + tgt.width  / 2
        if (Math.abs(newCardinal.y - tgtCy) < 0.5) {
          wps[last - 1] = { x: wps[last - 1].x, y: newCardinal.y }
        } else if (Math.abs(newCardinal.x - tgtCx) < 0.5) {
          wps[last - 1] = { x: newCardinal.x, y: wps[last - 1].y }
        }
      
        modified = true
      }
    }
  
    if (isFirstSeg && connection.source?.width) {
      const src = connection.source
      const nextToStart = wps[1]
      const newCardinal = nearestCardinalWithThreshold(src, nextToStart, SEGMENT_CARDINAL_SWITCH_THRESHOLD)
    
      if (newCardinal.x !== wps[0].x || newCardinal.y !== wps[0].y) {
        wps[0] = { x: newCardinal.x, y: newCardinal.y }
      
        const srcCy = src.y + src.height / 2
        const srcCx = src.x + src.width  / 2
        if (Math.abs(newCardinal.y - srcCy) < 0.5) {
          wps[1] = { x: wps[1].x, y: newCardinal.y }
        } else if (Math.abs(newCardinal.x - srcCx) < 0.5) {
          wps[1] = { x: newCardinal.x, y: wps[1].y }
        }
      
        modified = true
      }
    }
  
    // Redibujar con los waypoints corregidos.
    // Necesario porque bpmn-js ya llamó redrawConnection con la versión sin corregir.
    if (modified) {
      context.newWaypoints = wps  // sincronizar para que move.end use la versión correcta
      graphicsFactory.update('connection', connection, event.data.connectionGfx)
    }
  })
  //
  // Devuelve el cardinal del shape más cercano al punto dado,
  // con un umbral opcional: requiere que el punto esté N píxeles
  // MÁS ALLÁ del centro del shape antes de cambiar de cardinal.
  function nearestCardinalWithThreshold(
    shape: any,
    point: { x: number; y: number },
    threshold: number
  ): { x: number; y: number } {
    const cx = shape.x + shape.width  / 2
    const cy = shape.y + shape.height / 2
  
    const cardinals = [
      { x: cx,                    y: shape.y                }, // top
      { x: cx,                    y: shape.y + shape.height }, // bottom
      { x: shape.x,               y: cy                     }, // left
      { x: shape.x + shape.width, y: cy                     }, // right
    ]
  
    // Sin threshold: simplemente el cardinal más cercano al punto previo
    if (threshold === 0) {
      return cardinals.reduce((nearest, cardinal) => {
        const dNearest = Math.hypot(nearest.x - point.x, nearest.y - point.y)
        const dCurrent = Math.hypot(cardinal.x - point.x, cardinal.y - point.y)
        return dCurrent < dNearest ? cardinal : nearest
      })
    }
  
    // Con threshold: el punto debe estar N píxeles más allá del centro
    // en el eje dominante para cambiar de cardinal
    const dx = point.x - cx
    const dy = point.y - cy
  
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Eje horizontal domina
      if (dx > threshold)       return cardinals[3]  // right
      if (dx < -threshold)      return cardinals[2]  // left
      return Math.abs(dx) > Math.abs(dy) ? cardinals[dx > 0 ? 3 : 2] : cardinals[dy > 0 ? 1 : 0]
    } else {
      // Eje vertical domina
      if (dy > threshold)       return cardinals[1]  // bottom
      if (dy < -threshold)      return cardinals[0]  // top
      return Math.abs(dy) > Math.abs(dx) ? cardinals[dy > 0 ? 1 : 0] : cardinals[dx > 0 ? 3 : 2]
    }
  }

  function snapToCardinal(shape: any, point: { x: number; y: number }): { x: number; y: number } {   //FIX BUG-09
    const cardinals = [
      { x: shape.x + shape.width / 2, y: shape.y },                    // top
      { x: shape.x + shape.width / 2, y: shape.y + shape.height },     // bottom
      { x: shape.x,                   y: shape.y + shape.height / 2 }, // left
      { x: shape.x + shape.width,     y: shape.y + shape.height / 2 }, // right
    ]
    return cardinals.reduce((nearest, cardinal) => {
      const dNearest = Math.hypot(nearest.x - point.x, nearest.y - point.y)
      const dCurrent = Math.hypot(cardinal.x - point.x, cardinal.y - point.y)
      return dCurrent < dNearest ? cardinal : nearest
    })
  }

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
  'graphicsFactory',
]

export default {
  bendpoints: ['type', BizagiSegmentHandles],
}
