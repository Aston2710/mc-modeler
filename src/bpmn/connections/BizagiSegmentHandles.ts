/**
 * BizagiSegmentHandles — replaces diagram-js native `bendpoints` service.
 *
 * Changes from native Bendpoints.js:
 *  - No floating bendpoint → prevents click-to-add-point on empty segment area (fixes 2b)
 *  - No element.hover listener → handles appear only when selected, not on hover (fixes 2c)
 *  - No updateSegmentDraggerPosition call → segment bar stays fixed at midpoint (fixes 2a)
 */

 
// @ts-ignore
import { forEach } from 'min-dash'
 
// @ts-ignore
import { event as domEvent, query as domQuery, queryAll as domQueryAll } from 'min-dom'
 
// @ts-ignore
import { BENDPOINT_CLS, SEGMENT_DRAGGER_CLS, addSegmentDragger, getConnectionIntersection } from 'diagram-js/lib/features/bendpoints/BendpointUtil'
 
// @ts-ignore
import { escapeCSS } from 'diagram-js/lib/util/EscapeUtil'
 
// @ts-ignore
import { pointsAligned } from 'diagram-js/lib/util/Geometry'
 
// @ts-ignore
import { isPrimaryButton } from 'diagram-js/lib/util/Mouse'
 
// @ts-ignore
import { append as svgAppend, attr as svgAttr, classes as svgClasses, create as svgCreate, remove as svgRemove } from 'tiny-svg'
import { isGroupShape, freeEdgeDock } from './groupDocking'
import { slideDock, gatewayVertexDock, type Face } from './orthogonal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isGatewayShape(el: any): boolean {
  const bo = el?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function BizagiSegmentHandles(
    this: AnyObj,
    eventBus: AnyObj,
    canvas: AnyObj,
    interactionEvents: AnyObj,
    bendpointMove: AnyObj,
    connectionSegmentMove: AnyObj,
    graphicsFactory: AnyObj,
) {

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
      svgAttr(gfx as SVGElement, { 'data-element-id': element.id })
      svgClasses(gfx).add('djs-bendpoints')
      svgAppend(layer, gfx as SVGElement)
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
  function createBendpoints(_gfx: any, _connection: any) {
    // Vacío Intencionalmente.
    // Bizagi no renderiza "puntitos" verdes en las esquinas porque no permite
    // interactuar con ellas. Al dejar esto vacío, limpiamos la interfaz de basura visual.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createSegmentDraggers(gfx: any, connection: any) {
    const waypoints = connection.waypoints
    // Crear dragger para TODO segmento alineado (incl. el primero y el último,
    // adyacentes a los shapes): da libertad para empujar la flecha por donde
    // se quiera. El handler connectionSegment.move re-snapa el extremo al
    // cardinal del shape, manteniendo el anclaje.
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

  // NOTA: el marcado de ruta manual ya NO se hace aquí con un set directo al
  // businessObject (rompía undo/redo). Lo hace ManualRouteBehavior dentro del
  // commandStack, a partir de los hints segmentMove/bendpointMove que el código
  // nativo pone en connection.updateWaypoints.

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

  eventBus.on('bendpoint.move.move', function (event: AnyObj) {  //FIX BUG-09
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

    // Dock deslizante: el extremo sigue al cursor A LO LARGO del borde del
    // shape (estilo Ports de Bizagi), no se fuerza al centro de la cara.
    // Gateways: vértice del rombo con histéresis (evita flip/parpadeo).
    let snapped: { x: number; y: number; face: Face }
    if (isGroupShape(hoverShape)) {
      snapped = freeEdgeDock(hoverShape, cursorPoint)
    } else if (isGatewayShape(hoverShape)) {
      snapped = gatewayVertexDock(hoverShape, cursorPoint, context.__dockFace)
      context.__dockFace = snapped.face
    } else {
      snapped = slideDock(hoverShape, cursorPoint)
    }
    newWaypoints[idx] = { x: snapped.x, y: snapped.y, original: cursorPoint }
  })

  // Prioridad 500: disparamos DESPUÉS del handler interno de bpmn-js (prioridad 1000).
  //
  // El handler nativo (ConnectionSegmentMove) ya hace lo correcto para shapes
  // rectangulares: mueve el segmento perpendicular a su eje, auto-inserta/quita
  // stubs cuando el docking deja de intersectar el shape, y el crop de
  // BizagiConnectionDocking (intersección con el path SVG) desliza el extremo
  // A LO LARGO del borde. Antes este handler re-snapeaba el extremo al cardinal
  // centro (threshold=0) deshaciendo todo eso — era la causa de la rigidez y de
  // los saltos. Ahora solo corrige:
  //  - Gateways: el crop puede dejar el dock sobre el borde inclinado del rombo;
  //    snap al vértice de la cara elegida con histéresis (sin flip a mitad de drag).
  //  - Grupos: anclaje libre por arista (comportamiento existente).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('connectionSegment.move.move', 500, function (event: any) {
    const context = event.context
    const connection = context.connection
    if (!connection?.source || !connection?.target) return

    // Trabajar sobre connection.waypoints que bpmn-js ya actualizó en su handler.
    // Índices VIVOS (wps[0]/wps[last]), no derivados de originalWaypoints: el
    // nativo puede haber insertado/quitado stubs y los índices originales ya
    // no corresponden.
    const wps = connection.waypoints
    if (!wps || wps.length < 2) return
    const last = wps.length - 1

    let modified = false

    const tgt = connection.target
    if (tgt?.width && (isGroupShape(tgt) || isGatewayShape(tgt))) {
      const prevToEnd = wps[last - 1]
      let d: { x: number; y: number; face: Face }
      if (isGroupShape(tgt)) {
        d = freeEdgeDock(tgt, prevToEnd)
      } else {
        d = gatewayVertexDock(tgt, prevToEnd, context.__tgtFace)
        context.__tgtFace = d.face
      }
      if (d.x !== wps[last].x || d.y !== wps[last].y) {
        wps[last] = { x: d.x, y: d.y, original: { x: d.x, y: d.y } }
        if (d.face === 'left' || d.face === 'right') wps[last - 1] = { x: wps[last - 1].x, y: d.y }
        else wps[last - 1] = { x: d.x, y: wps[last - 1].y }
        modified = true
      }
    }

    const src = connection.source
    if (src?.width && (isGroupShape(src) || isGatewayShape(src))) {
      const nextToStart = wps[1]
      let d: { x: number; y: number; face: Face }
      if (isGroupShape(src)) {
        d = freeEdgeDock(src, nextToStart)
      } else {
        d = gatewayVertexDock(src, nextToStart, context.__srcFace)
        context.__srcFace = d.face
      }
      if (d.x !== wps[0].x || d.y !== wps[0].y) {
        wps[0] = { x: d.x, y: d.y, original: { x: d.x, y: d.y } }
        if (d.face === 'left' || d.face === 'right') wps[1] = { x: wps[1].x, y: d.y }
        else wps[1] = { x: d.x, y: wps[1].y }
        modified = true
      }
    }

    // Un solo redibujo extra y solo si corregimos algo (los shapes rect ya
    // quedaron bien dibujados por el handler nativo).
    if (modified) {
      context.newWaypoints = wps  // sincronizar para que move.end use la versión correcta
      graphicsFactory.update('connection', connection, event.data.connectionGfx)
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
  'graphicsFactory',
]

export default {
  bendpoints: ['type', BizagiSegmentHandles],
}
