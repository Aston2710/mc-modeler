import { BizagiDirectionalRouter } from './BizagiDirectionalRouter'
import type { Point, RouterObstacle } from './BizagiDirectionalRouter'
import { isManual, markManual } from './manualRoute'
import { isOrthogonal, repairChainFromStart, repairChainFromEnd, dockPoint, routeInvades } from './orthogonal'

type Face = 'top' | 'bottom' | 'left' | 'right'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Connection = any

function cx(s: Shape): number { return s.x + s.width  / 2 }
function cy(s: Shape): number { return s.y + s.height / 2 }

function isGateway(el: Shape): boolean {
  const bo = el?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

function isMessageFlow(conn: Connection): boolean {
  const bo = conn?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:MessageFlow'))
}

function isAssociationConn(conn: Connection): boolean {
  const bo = conn?.businessObject
  if (!bo || typeof bo.$instanceOf !== 'function') return false
  return bo.$instanceOf('bpmn:Association')
      || bo.$instanceOf('bpmn:DataInputAssociation')
      || bo.$instanceOf('bpmn:DataOutputAssociation')
}

function isBoundaryEvent(el: Shape): boolean {
  const bo = el?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:BoundaryEvent'))
}

// Cara del HOST sobre la que está montado el boundary event → la conexión
// debe salir hacia AFUERA del host por ese lado.
function boundaryExitFace(event: Shape, host: Shape): Face {
  const ecx = cx(event), ecy = cy(event)
  const d: [Face, number][] = [
    ['left',   Math.abs(ecx - host.x)],
    ['right',  Math.abs(ecx - (host.x + host.width))],
    ['top',    Math.abs(ecy - host.y)],
    ['bottom', Math.abs(ecy - (host.y + host.height))],
  ]
  return d.sort((a, b) => a[1] - b[1])[0][0]
}

function isConnector(el: Shape): boolean { return Array.isArray(el?.waypoints) }

function isRoutingContainer(el: Shape): boolean {
  const bo = el?.businessObject
  if (!bo || typeof bo.$instanceOf !== 'function') return false
  return bo.$instanceOf('bpmn:Participant')
      || bo.$instanceOf('bpmn:Lane')
      || bo.$instanceOf('bpmn:Group')
}

function toObstacle(s: Shape): RouterObstacle {
  return { x: s.x, y: s.y, width: s.width, height: s.height }
}

function faceCardinal(s: Shape, face: Face): Point {
  switch (face) {
    case 'top':    return { x: cx(s), y: s.y }
    case 'bottom': return { x: cx(s), y: s.y + s.height }
    case 'left':   return { x: s.x,           y: cy(s) }
    case 'right':  return { x: s.x + s.width, y: cy(s) }
  }
}

function gatewayCardinal(gw: Shape, face: Face): Point {
  const gcx = gw.x + gw.width  / 2
  const gcy = gw.y + gw.height / 2
  switch (face) {
    case 'top':    return { x: gcx,             y: gw.y }
    case 'bottom': return { x: gcx,             y: gw.y + gw.height }
    case 'left':   return { x: gw.x,            y: gcy }
    case 'right':  return { x: gw.x + gw.width, y: gcy }
  }
}

function nearestFace(s: Shape, p: Point): Face {
  const d: [Face, number][] = [
    ['top',    Math.hypot(p.x - cx(s), p.y - s.y)],
    ['bottom', Math.hypot(p.x - cx(s), p.y - (s.y + s.height))],
    ['left',   Math.hypot(p.x - s.x,             p.y - cy(s))],
    ['right',  Math.hypot(p.x - (s.x + s.width), p.y - cy(s))],
  ]
  return d.sort((a, b) => a[1] - b[1])[0][0]
}

function nearestGatewayFace(gw: Shape, p: Point): Face {
  const gcx = gw.x + gw.width  / 2
  const gcy = gw.y + gw.height / 2
  const vertices: [Face, Point][] = [
    ['top',    { x: gcx,              y: gw.y }],
    ['bottom', { x: gcx,              y: gw.y + gw.height }],
    ['left',   { x: gw.x,             y: gcy }],
    ['right',  { x: gw.x + gw.width,  y: gcy }],
  ]
  return vertices
    .map(([face, v]) => [face, Math.hypot(p.x - v.x, p.y - v.y)] as [Face, number])
    .sort((a, b) => a[1] - b[1])[0][0]
}

// gatewayFace: cara del gateway que mira HACIA `other`.
// Usado cuando el gateway es TARGET (cara de llegada) o para referencias de distancia.
// Mantiene la lógica original de ángulos — equivalente a CreatePointDirection de C#
// cuando se calcula la dirección del shape DESTINO hacia el source.
function gatewayFace(gw: Shape, other: Shape): Face {
  const dx = cx(other) - cx(gw)
  const dy = cy(other) - cy(gw)
  if (Math.abs(dx) > Math.abs(dy) * 1.5) return dx >= 0 ? 'right' : 'left'
  if (Math.abs(dy) > Math.abs(dx) * 1.5) return dy >= 0 ? 'bottom' : 'top'
  return dy >= 0 ? 'bottom' : 'top'
}

// gatewayExitFace: cara por la que debe SALIR el gateway cuando es SOURCE.
// Equivalente exacto de C# createDirectionalPoints para el shape de inicio:
// cuando el gateway está completamente a la derecha del target, C# sale perpendicular
// (bottom/top) en lugar de directamente (left), produciendo rutas más cortas y naturales.
// Separado de gatewayFace porque la lógica de salida (source) difiere de la de
// llegada (target) en los casos donde los shapes no se solapan horizontalmente.
function gatewayExitFace(gw: Shape, other: Shape): Face {
  const r1 = { right: gw.x + gw.width, left: gw.x, bottom: gw.y + gw.height, top: gw.y }
  const r2 = { right: other.x + other.width, left: other.x, bottom: other.y + other.height, top: other.y }

  if (r1.right <= r2.left)  return 'right'   // gateway a la izquierda del target → sale derecha

  if (r1.left >= r2.right) {                  // gateway completamente a la derecha del target
    if (r1.bottom <= r2.top)  return 'bottom' // gateway encima → sale abajo (ruta directa ↓)
    if (r1.top >= r2.bottom)  return 'top'    // gateway debajo → sale arriba (ruta directa ↑)
    return 'top'                              // inline → U-shape hacia arriba (igual que C#)
  }

  if (r1.bottom <= r2.top)  return 'bottom'   // gateway completamente arriba → sale abajo
  return 'top'                                // gateway completamente abajo → sale arriba
}


// naturalFace(shape, other): cara de 'shape' que geométricamente mira hacia 'other'.
// Usa distancia euclidiana desde los midpoints de cada cara al centro del otro shape,
// lo que maneja correctamente tanto los casos directos como los diagonales.

function naturalFace(shape: Shape, other: Shape): Face {
  return isGateway(shape)
    ? nearestGatewayFace(shape, { x: cx(other), y: cy(other) })
    : nearestFace(shape, { x: cx(other), y: cy(other) })
}

function getOccupiedFaces(shape: Shape, excludeConnection: Connection): Set<Face> {
  const used = new Set<Face>()
  const outgoing: Connection[] = shape.outgoing || []
  for (const c of outgoing) {
    if (c === excludeConnection) continue
    const wps: Point[] | undefined = c.waypoints
    if (!wps || wps.length < 1) continue
    used.add(isGateway(shape) ? nearestGatewayFace(shape, wps[0]) : nearestFace(shape, wps[0]))
  }
  const incoming: Connection[] = shape.incoming || []
  for (const c of incoming) {
    if (c === excludeConnection) continue
    const wps: Point[] | undefined = c.waypoints
    if (!wps || wps.length < 1) continue
    used.add(isGateway(shape) ? nearestGatewayFace(shape, wps[wps.length - 1]) : nearestFace(shape, wps[wps.length - 1]))
  }
  return used
}

// isSource=true  → shape actúa como SOURCE: usar gatewayExitFace (lógica C# de salida)
// isSource=false → shape actúa como TARGET: usar gatewayFace (cara más cercana al source)
function pickFreeCardinalFace(shape: Shape, other: Shape, connection: Connection, isSource = true): Face {
  const preferredFace = isGateway(shape)
    ? (isSource ? gatewayExitFace(shape, other) : gatewayFace(shape, other))
    : naturalFace(shape, other)
  const occupied = getOccupiedFaces(shape, connection)
  if (!occupied.has(preferredFace)) return preferredFace
  const getCardinalPoint = (s: Shape, f: Face): Point =>
    isGateway(s) ? gatewayCardinal(s, f) : faceCardinal(s, f)
  const referencePoint = getCardinalPoint(other,
    isGateway(other) ? gatewayFace(other, shape) : naturalFace(other, shape)
  )
  const allFaces: Face[] = ['right', 'left', 'bottom', 'top']
  const ordered = allFaces
    .filter(f => f !== preferredFace)
    .sort((a, b) => {
      const pa = getCardinalPoint(shape, a)
      const pb = getCardinalPoint(shape, b)
      return Math.hypot(pa.x - referencePoint.x, pa.y - referencePoint.y)
           - Math.hypot(pb.x - referencePoint.x, pb.y - referencePoint.y)
    })
  for (const f of ordered) {
    if (!occupied.has(f)) return f
  }
  return preferredFace
}

function pickFacesMultiConn(src: Shape, tgt: Shape, connection: Connection): [Face, Face] {
  const r1 = { left: src.x, right: src.x + src.width,  top: src.y, bottom: src.y + src.height }
  const r2 = { left: tgt.x, right: tgt.x + tgt.width,  top: tgt.y, bottom: tgt.y + tgt.height }
  const outCount = ((src.outgoing || []) as Connection[]).filter(c => c !== connection).length
  const inCount  = ((tgt.incoming || []) as Connection[]).filter(c => c !== connection).length
  let sFace: Face = naturalFace(src, tgt)
  let tFace: Face = naturalFace(tgt, src)
  // src gateway: isSource=true → gatewayExitFace (cara de salida, lógica C#)
  // tgt gateway: isSource=false → gatewayFace (cara de llegada, cara más cercana)
  if (isGateway(src)) sFace = pickFreeCardinalFace(src, tgt, connection, true)
  if (isGateway(tgt)) tFace = pickFreeCardinalFace(tgt, src, connection, false)
  if (r1.right < r2.left) {
    const hDist = r2.left - r1.right
    if (inCount > 0 && !isGateway(tgt)) {
      if (r1.bottom < r2.top) {
        const vDist = r2.top - r1.bottom
        tFace = vDist > hDist ? 'top' : 'left'
      } else if (r1.top > r2.bottom) {
        const vDist = r1.top - r2.bottom
        tFace = vDist > hDist ? 'bottom' : 'left'
      } else {
        tFace = 'left'
      }
    }
    if (outCount > 0 && !isGateway(src)) {
      if (r1.top > r2.bottom) {
        const vDist = r1.top - r2.bottom
        sFace = vDist > hDist ? 'top' : 'right'
      } else if (r1.bottom < r2.top) {
        const vDist = r2.top - r1.bottom
        sFace = vDist > hDist ? 'bottom' : 'right'
      } else {
        sFace = 'right'
      }
    }
  } else if (r1.left > r2.right) {
    if (!isGateway(src) && !isGateway(tgt)) {
      if (r1.top > r2.bottom) {
        sFace = 'top'; tFace = 'bottom'
      } else if (r1.bottom < r2.top) {
        sFace = 'bottom'; tFace = 'top'
      } else {
        sFace = 'top'; tFace = 'top'
      }
    }
  } else if (r1.top > r2.bottom) {
    const hasBackline = ((src.incoming || []) as Connection[]).some(c =>
      c !== connection && c.source?.id === tgt.id
    )
    if (hasBackline) {
      if (!isGateway(src)) sFace = 'right'
      if (!isGateway(tgt)) tFace = 'right'
    } else {
      if (!isGateway(src)) sFace = 'top'
      if (!isGateway(tgt)) tFace = 'bottom'
    }
  } else {
    if (!isGateway(src)) sFace = 'bottom'
    if (!isGateway(tgt)) tFace = 'top'
  }
  return [sFace, tFace]
}

function pickFace(shape: Shape, other: Shape, hint?: Point, shapeMoveMode?: boolean): Face {
  if (!shapeMoveMode && hint) {
    return isGateway(shape) ? nearestGatewayFace(shape, hint) : nearestFace(shape, hint)
  }
  if (isGateway(shape)) return gatewayFace(shape, other)
  return naturalFace(shape, other)
}

function hasDiagonals(wps: Point[] | null | undefined): boolean {
  if (!wps || wps.length < 2) return false
  for (let i = 1; i < wps.length; i++) {
    if (Math.abs(wps[i].x - wps[i-1].x) > 2 && Math.abs(wps[i].y - wps[i-1].y) > 2) return true
  }
  return false
}

function touchesShape(shape: Shape, p: Point, tol = 2): boolean {
  return p.x >= shape.x - tol && p.x <= shape.x + shape.width + tol &&
         p.y >= shape.y - tol && p.y <= shape.y + shape.height + tol
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiLayouter(this: any, elementRegistry: any, eventBus: any) {
  this._elementRegistry = elementRegistry
  this._router = new BizagiDirectionalRouter()

  // Cache de candidatos a obstáculo: guarda REFERENCIAS a los elementos (las
  // coordenadas se leen vivas en cada layout), así el filtro estático (tipo,
  // label, contenedor) se paga una sola vez y no O(conexiones × elementos) en
  // moves múltiples o import. Se invalida solo cuando cambia el conjunto de
  // elementos, no en cada movimiento.
  this._obstacleElements = null
  const invalidate = () => { this._obstacleElements = null }
  eventBus.on(['shape.added', 'shape.removed', 'import.render.complete', 'diagram.clear'], invalidate)
}
BizagiLayouter.$inject = ['elementRegistry', 'eventBus']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype._getObstacleElements = function (): any[] {
  if (!this._obstacleElements) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._elementRegistry.forEach((el: any) => {
      if (isConnector(el)) return
      if (!el.width || !el.height) return
      if (el.type === 'label' || (el.id && el.id.includes('_label'))) return
      if (isRoutingContainer(el)) return
      arr.push(el)
    })
    this._obstacleElements = arr
  }
  return this._obstacleElements
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.layoutConnection = function (connection: Connection, hints: any): Point[] {
  hints = hints || {}
  const src: Shape = hints.source || connection.source
  const tgt: Shape = hints.target || connection.target
  if (!src?.width || !src?.height || !tgt?.width || !tgt?.height) return connection.waypoints || []
  
  //if (src === tgt) return connection.waypoints || []
  
  // Self-loop: source y target son el mismo shape.
  // Generar una ruta en U que sale por top-right y entra por top-left,
  // bordeando el shape por arriba. El offset vertical (40px) y horizontal (20px)
  // son los mismos que usa Bizagi para este caso.
  if (src === tgt) {
    // Bucle editado manualmente: preservarlo. Al mover el shape, trasladar el
    // bucle completo con el delta (hint = dock viejo + delta del movimiento).
    const loopWps: Point[] | undefined = connection.waypoints
    if (!hints.forceReroute && isManual(connection) && loopWps && loopWps.length >= 3 && isOrthogonal(loopWps)) {
      // Si el bucle ya toca el shape, está en su sitio — chequear PRIMERO:
      // MoveShapeHandler layoutea el loop dos veces (pasada incoming y
      // outgoing); sin este guard la segunda pasada lo trasladaría de nuevo.
      if (touchesShape(src, loopWps[0]) && touchesShape(src, loopWps[loopWps.length - 1])) {
        return loopWps.map((p: Point) => ({ x: p.x, y: p.y }))
      }
      // Desanclado (el shape acaba de moverse): trasladar el bucle completo
      // con el delta implícito en el hint (dock viejo + delta del movimiento).
      const sHintLoop = typeof hints.connectionStart === 'object' && hints.connectionStart ? hints.connectionStart : undefined
      const tHintLoop = typeof hints.connectionEnd === 'object' && hints.connectionEnd ? hints.connectionEnd : undefined
      const ref = sHintLoop ?? tHintLoop
      if (ref) {
        const base = sHintLoop ? loopWps[0] : loopWps[loopWps.length - 1]
        const dx = ref.x - base.x
        const dy = ref.y - base.y
        return loopWps.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }))
      }
    }
    const offset = 40
    const hOffset = 20
    const exitX  = src.x + src.width  - hOffset   // sale cerca del borde derecho superior
    const enterX = src.x              + hOffset   // entra cerca del borde izquierdo superior
    const topY   = src.y                          // borde superior del shape
    const loopY  = src.y - offset                 // punto más alto del bucle

    return [
      { x: exitX,  y: topY   },   // salida del shape (borde superior, lado derecho)
      { x: exitX,  y: loopY  },   // sube verticalmente
      { x: enterX, y: loopY  },   // cruza horizontalmente por arriba
      { x: enterX, y: topY   },   // baja de vuelta al borde superior del shape
    ]
  }

  // Ruta manual: semántica Bizagi fiel (findings §14, DirectionalRouter.CalculateRoute).
  // Se REPARA preservando la forma del usuario (extremos re-anclados con dock
  // deslizante + corrección en cadena) y se conserva la ruta reparada SOLO si
  // sigue siendo válida (ortogonal, extremos anclados, sin atravesar shapes) y
  // no tiene más puntos que la ruta fresca del router. Si no, gana la fresca
  // (auto-sanado silencioso) y se señala para limpiar el flag manual.
  // Associations (comentarios, data, grupos): siguen al usuario — se preserva
  // su forma re-anclando extremos, sin evasión de obstáculos (cruzar shapes es
  // normal para un link a anotación) y sin criterio de simplicidad §14.
  const assoc = isAssociationConn(connection)

  // hints.forceReroute (reset del context pad): ignora la ruta manual y
  // devuelve siempre la solución fresca del router.
  const manualRoute = !hints.forceReroute && (isManual(connection) || assoc)
    && connection.waypoints && connection.waypoints.length >= 2

  const hasMovedAnchor = (hints.connectionStart != null && typeof hints.connectionStart === 'object')
                      || (hints.connectionEnd   != null && typeof hints.connectionEnd   === 'object')
  const shapeMoveMode = hints.connectionStart === false
                     || hints.connectionEnd   === false
  let sFace: Face
  let tFace: Face
  const outCount = ((src.outgoing || []) as Connection[]).filter((c: Connection) => c !== connection).length
  const inCount  = ((tgt.incoming || []) as Connection[]).filter((c: Connection) => c !== connection).length
  const hasMultiConn = outCount > 0 || inCount > 0
  if (hasMovedAnchor) {
    sFace = pickFace(src, tgt, hints.connectionStart, false)
    tFace = pickFace(tgt, src, hints.connectionEnd,   false)
  } else if (shapeMoveMode) {
    sFace = pickFace(src, tgt, undefined, true)
    tFace = pickFace(tgt, src, undefined, true)
  } else if (hasMultiConn) {
    ;[sFace, tFace] = pickFacesMultiConn(src, tgt, connection)
  } else {
    // src: isSource=true → gatewayExitFace si es gateway
    // tgt: isSource=false → gatewayFace si es gateway
    sFace = pickFreeCardinalFace(src, tgt, connection, true)
    tFace = pickFreeCardinalFace(tgt, src, connection, false)
  }

  // Boundary events: salir siempre hacia AFUERA del host (la cara del host en
  // la que está montado el evento), nunca hacia adentro.
  if (isBoundaryEvent(src) && src.host) {
    sFace = boundaryExitFace(src, src.host)
  }

  // Message flows entre pools: preferencia vertical enfrentada (equivalente a
  // 'straight'/'v:v' del BpmnLayouter nativo).
  const msgFlow = isMessageFlow(connection)
  if (msgFlow) {
    if (cy(tgt) >= cy(src)) { sFace = 'bottom'; tFace = 'top' }
    else { sFace = 'top'; tFace = 'bottom' }
  }

  const start = isGateway(src) ? gatewayCardinal(src, sFace) : faceCardinal(src, sFace)
  const end   = isGateway(tgt) ? gatewayCardinal(tgt, tFace) : faceCardinal(tgt, tFace)

  // Message flow 'straight': si los shapes se solapan horizontalmente, alinear
  // ambos docks a una misma x → línea vertical recta de 2 puntos.
  if (msgFlow) {
    const lo = Math.max(src.x + 12, tgt.x + 12)
    const hi = Math.min(src.x + src.width - 12, tgt.x + tgt.width - 12)
    if (lo <= hi) {
      const x = Math.min(hi, Math.max(lo, (cx(src) + cx(tgt)) / 2))
      start.x = x
      end.x = x
    }
  }

  // Separación de flechas paralelas (TableRouter-lite, findings §4): con ≥2
  // conexiones entre el mismo par de shapes (incluidas las de vuelta), cada
  // una se desplaza 10px por índice a lo largo de la cara, centrado, para que
  // no se encimen. Orden estable por id (determinista entre peers Yjs).
  // Gateways quedan en el vértice del rombo (no se desplazan).
  if (!manualRoute) {
    const between: Connection[] = (((src.outgoing || []) as Connection[]).filter((c: Connection) => c.target === tgt))
      .concat(((src.incoming || []) as Connection[]).filter((c: Connection) => c.source === tgt))
    if (between.length >= 2) {
      const ordered = [...between].sort((a, b) => String(a.id).localeCompare(String(b.id)))
      const idx = ordered.indexOf(connection)
      if (idx >= 0) {
        const off = (idx - (ordered.length - 1) / 2) * 10
        const clampOff = (v: number, half: number) => Math.max(-half, Math.min(half, v))
        if (!isGateway(src)) {
          if (sFace === 'left' || sFace === 'right') start.y += clampOff(off, Math.max(0, src.height / 2 - 12))
          else start.x += clampOff(off, Math.max(0, src.width / 2 - 12))
        }
        if (!isGateway(tgt)) {
          if (tFace === 'left' || tFace === 'right') end.y += clampOff(off, Math.max(0, tgt.height / 2 - 12))
          else end.x += clampOff(off, Math.max(0, tgt.width / 2 - 12))
        }
      }
    }
  }
  const obstacles: RouterObstacle[] = []
  if (!assoc) {
    for (const el of this._getObstacleElements()) {
      if (!el.parent) continue  // desmontado (colapso/undo a mitad de lote)
      if (el.id === src.id || el.id === tgt.id) continue
      obstacles.push(toObstacle(el))
    }
  }
  const router: BizagiDirectionalRouter = this._router
  // Manual: la ruta fresca debe calcularse LIMPIA (sin reusar waypoints) para
  // que la comparación repair-vs-fresh sea contra la solución óptima.
  const isDragging = hasMovedAnchor && !manualRoute
  const existingWaypoints = isDragging && connection.waypoints ? connection.waypoints : undefined
  let prevStartDir: Face | undefined
  let prevEndDir: Face | undefined
  if (existingWaypoints && existingWaypoints.length >= 2) {
    const wp0 = existingWaypoints[0]
    const wp1 = existingWaypoints[1]
    prevStartDir = isGateway(src) ? nearestGatewayFace(src, wp0) : nearestFace(src, wp0)
    const segDx = wp1.x - wp0.x
    const segDy = wp1.y - wp0.y
    if (Math.abs(segDx) > Math.abs(segDy)) {
      prevStartDir = segDx > 0 ? 'right' : 'left'
    } else if (Math.abs(segDy) > 0) {
      prevStartDir = segDy > 0 ? 'bottom' : 'top'
    }
    const wpL  = existingWaypoints[existingWaypoints.length - 1]
    const wpL1 = existingWaypoints[existingWaypoints.length - 2]
    const segDx2 = wpL.x - wpL1.x
    const segDy2 = wpL.y - wpL1.y
    if (Math.abs(segDx2) > Math.abs(segDy2)) {
      prevEndDir = segDx2 > 0 ? 'left' : 'right'
    } else if (Math.abs(segDy2) > 0) {
      prevEndDir = segDy2 > 0 ? 'top' : 'bottom'
    }
  }
  const srcObs = toObstacle(src)
  const tgtObs = toObstacle(tgt)

  const fresh = router.calculateRoute(
    start, end,
    sFace as Face, tFace as Face,
    obstacles,
    existingWaypoints,
    prevStartDir, prevEndDir,
    srcObs,
    tgtObs
  )

  // ── Capa 2: validación final + fallback de caras ──────────────────────────
  // Una ruta es "limpia" si es ortogonal y NO invade src, tgt ni ningún
  // obstáculo (routeInvades detecta el punto ciego "entra y muere dentro" que
  // el router no garantiza — verifySolutionPoints/Lines son best-effort y solo
  // ven traversal completo). Si la ruta primaria invade, se recalculan las
  // caras: primero las geométricas (ignorando el hint viejo — causa raíz del
  // bug), luego una búsqueda acotada sobre los 16 pares de caras. Associations
  // se excluyen (cruzar shapes es normal para un link a anotación).
  const isClean = (wps: Point[]): boolean => {
    if (!wps || wps.length < 2 || !isOrthogonal(wps)) return false
    if (routeInvades(wps, srcObs) || routeInvades(wps, tgtObs)) return false
    for (const o of obstacles) if (routeInvades(wps, o)) return false
    return true
  }

  const computeRoute = (sF: Face, tF: Face): Point[] => {
    const s = isGateway(src) ? gatewayCardinal(src, sF) : faceCardinal(src, sF)
    const e = isGateway(tgt) ? gatewayCardinal(tgt, tF) : faceCardinal(tgt, tF)
    return router.calculateRoute(s, e, sF, tF, obstacles, undefined, undefined, undefined, srcObs, tgtObs)
  }

  const ensureClean = (primary: Point[]): Point[] => {
    if (assoc || isClean(primary)) return primary
    // caras geométricas (desde la posición ACTUAL, no el hint) como primer intento
    const sGeo: Face = isGateway(src) ? gatewayExitFace(src, tgt) : naturalFace(src, tgt)
    const tGeo: Face = isGateway(tgt) ? gatewayFace(tgt, src)     : naturalFace(tgt, src)
    const FACES: Face[] = ['top', 'bottom', 'left', 'right']
    const candidates: [Face, Face][] = [[sGeo, tGeo]]
    for (const a of FACES) for (const b of FACES) candidates.push([a, b])
    const tried = new Set<string>()
    for (const [a, b] of candidates) {
      const key = a + '|' + b
      if (tried.has(key)) continue
      tried.add(key)
      const r = computeRoute(a, b)
      if (isClean(r)) return r
    }
    if (import.meta.env?.DEV) console.warn('[ortho] sin par de caras sin invasión', connection.id)
    return primary
  }

  if (manualRoute) {
    // Reparación: re-anclar extremos preservando el offset del usuario.
    // hints.connectionStart/End (cuando son Points) vienen de MoveShapeHandler
    // = dock anterior + delta del movimiento → conservan la posición relativa.
    let repaired: Point[] = connection.waypoints.map((p: Point) => ({ x: p.x, y: p.y }))
    const sHint = typeof hints.connectionStart === 'object' && hints.connectionStart ? hints.connectionStart : undefined
    const tHint = typeof hints.connectionEnd === 'object' && hints.connectionEnd ? hints.connectionEnd : undefined

    const sDock = dockPoint(src, sHint ?? repaired[1] ?? repaired[repaired.length - 1], isGateway(src) ? 'gateway' : 'rect')
    repaired = repairChainFromStart(repaired, sDock, sDock.face)
    const tDock = dockPoint(tgt, tHint ?? repaired[repaired.length - 2] ?? repaired[0], isGateway(tgt) ? 'gateway' : 'rect')
    repaired = repairChainFromEnd(repaired, tDock, tDock.face)

    // Criterio Bizagi (findings §14): conservar la reparada solo si es válida
    // (ortogonal, anclada y SIN invadir src/tgt/obstáculos) y no más compleja
    // que la fresca. Si no, gana la fresca (ya saneada por ensureClean) y se
    // señala la limpieza del flag manual VÍA HINTS (canal del comando:
    // context.hints es el mismo objeto — lo lee ManualRouteBehavior en
    // postExecuted). No se muta la conexión: una llamada fuera de comando
    // descarta sus hints y no deja markers huérfanos.
    const valid = repaired.length >= 2
      && isOrthogonal(repaired)
      && touchesShape(src, repaired[0])
      && touchesShape(tgt, repaired[repaired.length - 1])
      && !routeInvades(repaired, srcObs)
      && !routeInvades(repaired, tgtObs)
      && !obstacles.some(o => routeInvades(repaired, o))

    // Associations: sin criterio de simplicidad — la forma del usuario manda
    // mientras sea válida.
    const cleaned = ensureClean(fresh)
    if (valid && (assoc || repaired.length <= cleaned.length)) return repaired

    if (!assoc) hints.orthoAutoRerouted = true
    return cleaned
  }

  return ensureClean(fresh)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.repairConnection = function (connection: Connection, _newEnd: any, hints: any): Point[] {
  return this.layoutConnection(connection, hints || {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConnectionImportNormalizer(eventBus: any, elementRegistry: any, modeling: any, layouter: any, commandStack: any) {
  eventBus.on('import.render.complete', 100, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connections: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elementRegistry.forEach((el: any) => { if (el.waypoints) connections.push(el) })
    let fixed = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connections.forEach((conn: any) => {
      if (!conn.source || !conn.target) return
      if (conn.source === conn.target && conn.waypoints?.length >= 2) return
      // Ruta manual: respetar los waypoints del XML salvo que estén rotos
      // (diagonales o extremos desanclados) — en ese caso layoutConnection
      // aplica repair-or-reroute (semántica Bizagi) y los sana al abrir.
      if (isManual(conn)) {
        const wps = conn.waypoints
        const broken = hasDiagonals(wps)
          || !wps || wps.length < 2
          || !touchesShape(conn.source, wps[0])
          || !touchesShape(conn.target, wps[wps.length - 1])
        if (!broken) return
      }
      const layoutHints = { source: conn.source, target: conn.target } as { [k: string]: unknown }
      const wp = layouter.layoutConnection(conn, layoutHints)
      if (wp?.length >= 2) { modeling.updateWaypoints(conn, wp); fixed++ }
      if (layoutHints.orthoAutoRerouted) markManual(conn, false)
    })
    if (fixed > 0) commandStack.clear()
  })
}
ConnectionImportNormalizer.$inject = ['eventBus', 'elementRegistry', 'modeling', 'layouter', 'commandStack']

// WaypointRounder — DEGRADADO a aserción de desarrollo.
//
// Antes era un parche reactivo: en cada connection.changed re-ruteaba
// diagonales/extremos sueltos con modeling.updateWaypoints FUERA de comando,
// lo que creaba entradas de undo separadas y vaciaba el redo stack. Ese rol
// lo cubre ahora OrthogonalityBehavior a nivel de commandStack (invariante +
// redondeo de floats dentro del mismo comando).
//
// Aquí solo queda la telemetría de burn-in: si alguna vez aparece una diagonal
// fuera del flujo de comandos, es un camino de código no cubierto por el
// invariante y debe reportarse — nunca debería dispararse.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WaypointRounder(eventBus: any) {
  if (!import.meta.env?.DEV) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('connection.changed', function (event: any) {
    const conn = event.element
    if (!conn?.waypoints?.length) return
    if (hasDiagonals(conn.waypoints)) {
      console.warn('[ortho] aserción: diagonal fuera del invariante de comando', conn.id, conn.waypoints)
    }
  })
}
WaypointRounder.$inject = ['eventBus']

export default {
  __init__: ['connectionImportNormalizer', 'waypointRounder'],
  layouter: ['type', BizagiLayouter],
  connectionImportNormalizer: ['type', ConnectionImportNormalizer],
  waypointRounder: ['type', WaypointRounder],
}