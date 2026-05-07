import { BizagiDirectionalRouter } from './BizagiDirectionalRouter'
import type { Point, RouterObstacle } from './BizagiDirectionalRouter'

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

// Reemplaza defaultFace en todos los call sites donde se calcula sFace/tFace
// naturalFace(shape, other) = face de 'shape' que geométricamente más cerca está del centro de 'other'
// A diferencia de defaultFace, maneja correctamente los casos diagonales
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

function getCardinals(shape: Shape): Point[] {
  if (!shape?.width || !shape?.height) return []
  const ccx = shape.x + shape.width  / 2
  const ccy = shape.y + shape.height / 2
  return [
    { x: ccx,                    y: shape.y                },
    { x: ccx,                    y: shape.y + shape.height },
    { x: shape.x,                y: ccy                    },
    { x: shape.x + shape.width,  y: ccy                    },
  ]
}

function endpointsOffCardinal(conn: Connection): boolean {
  const wps = conn.waypoints
  if (!wps || wps.length < 2 || !conn.source || !conn.target) return false
  const srcOk = getCardinals(conn.source).some(
    c => Math.abs(c.x - wps[0].x) < 1.5 && Math.abs(c.y - wps[0].y) < 1.5
  )
  const tgtOk = getCardinals(conn.target).some(
    c => Math.abs(c.x - wps[wps.length - 1].x) < 1.5 && Math.abs(c.y - wps[wps.length - 1].y) < 1.5
  )
  return !srcOk || !tgtOk
}

function hasDiagonals(wps: Point[] | null | undefined): boolean {
  if (!wps || wps.length < 2) return false
  for (let i = 1; i < wps.length; i++) {
    if (Math.abs(wps[i].x - wps[i-1].x) > 2 && Math.abs(wps[i].y - wps[i-1].y) > 2) return true
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiLayouter(this: any, elementRegistry: any) {
  this._elementRegistry = elementRegistry
  this._router = new BizagiDirectionalRouter()
}
BizagiLayouter.$inject = ['elementRegistry']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.layoutConnection = function (connection: Connection, hints: any): Point[] {
  hints = hints || {}
  const src: Shape = hints.source || connection.source
  const tgt: Shape = hints.target || connection.target
  if (!src?.width || !src?.height || !tgt?.width || !tgt?.height) return connection.waypoints || []
  if (src === tgt) return connection.waypoints || []
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
  const start = isGateway(src) ? gatewayCardinal(src, sFace) : faceCardinal(src, sFace)
  const end   = isGateway(tgt) ? gatewayCardinal(tgt, tFace) : faceCardinal(tgt, tFace)
  const obstacles: RouterObstacle[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this._elementRegistry.forEach((el: any) => {
    if (isConnector(el)) return
    if (!el.width || !el.height) return
    if (!el.parent) return
    if (el.type === 'label' || (el.id && el.id.includes('_label'))) return
    if (isRoutingContainer(el)) return
    const obs = toObstacle(el)
    if (el.id === src.id) return
    if (el.id === tgt.id) return
    obstacles.push(obs)
  })
  const router: BizagiDirectionalRouter = this._router
  const isDragging = hasMovedAnchor
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
  return router.calculateRoute(
    start, end,
    sFace as Face, tFace as Face,
    obstacles,
    existingWaypoints,
    prevStartDir, prevEndDir,
    toObstacle(src),
    toObstacle(tgt)
  )
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
      const wp = layouter.layoutConnection(conn, { source: conn.source, target: conn.target })
      if (wp?.length >= 2) { modeling.updateWaypoints(conn, wp); fixed++ }
    })
    if (fixed > 0) commandStack.clear()
  })
}
ConnectionImportNormalizer.$inject = ['eventBus', 'elementRegistry', 'modeling', 'layouter', 'commandStack']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WaypointRounder(eventBus: any, modeling: any, layouter: any, elementRegistry: any) {
  const rounding = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus.on('connection.changed', function (event: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = event.element
    if (!conn?.waypoints?.length) return
    if (rounding.has(conn.id)) return
    const wps = conn.waypoints
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rounded = wps.map((p: any) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasFloats = wps.some((p: any, i: number) => p.x !== rounded[i].x || p.y !== rounded[i].y)
    let needsRelayout = false
    if (conn.source && conn.target && wps.length >= 2) {
      const srcCards = getCardinals(conn.source)
      const tgtCards = getCardinals(conn.target)
      const startOk = srcCards.some(
        (c: Point) => Math.abs(c.x - wps[0].x) < 1.5 && Math.abs(c.y - wps[0].y) < 1.5
      )
      const endOk = tgtCards.some(
        (c: Point) => Math.abs(c.x - wps[wps.length - 1].x) < 1.5 &&
                      Math.abs(c.y - wps[wps.length - 1].y) < 1.5
      )
      if (!startOk || !endOk) needsRelayout = true
    }
    if (!needsRelayout && hasDiagonals(wps)) needsRelayout = true
    if (!needsRelayout && conn.source && conn.target && wps.length >= 2) {
      const srcId = conn.source.id
      //const tgtId = conn.target.id
      const obstaclesNoSrc: RouterObstacle[] = []  // sin src, con tgt
    
      elementRegistry.forEach((el: any) => {
        if (Array.isArray(el?.waypoints)) return
        if (!el.width || !el.height || !el.parent) return
        if (el.type === 'label' || el.id?.includes('_label')) return
        if (isRoutingContainer(el)) return
        if (el.id === srcId) return
        const obs = toObstacle(el)
        obstaclesNoSrc.push(obs)
        // ← ya no hay obstaclesNoSrcTgt ni el push condicional
      })
      outer: for (let i = 1; i < wps.length; i++) {
        // ← ya no hay isLastSeg ni la distinción entre último y no último
        const obs = obstaclesNoSrc  // mismo array para TODOS los segmentos
        const p1 = wps[i - 1], p2 = wps[i]
        for (const o of obs) {
          if (Math.abs(p1.y - p2.y) <= 1 && p1.y >= o.y && p1.y <= o.y + o.height) {
            if ((p1.x <= o.x && p2.x >= o.x + o.width) ||
                (p2.x <= o.x && p1.x >= o.x + o.width)) {
              needsRelayout = true; break outer
            }
          }
          if (Math.abs(p1.x - p2.x) <= 1 && p1.x >= o.x && p1.x <= o.x + o.width) {
            if ((p1.y <= o.y && p2.y >= o.y + o.height) ||
                (p2.y <= o.y && p1.y >= o.y + o.height)) {
              needsRelayout = true; break outer
            }
          }
        }
      }
    }
    // 
    if (!hasFloats && !needsRelayout) return
    rounding.add(conn.id)
    if (needsRelayout && conn.source && conn.target) {
      const wp = layouter.layoutConnection(conn, { source: conn.source, target: conn.target })
      if (wp?.length >= 2) modeling.updateWaypoints(conn, wp)
    } else {
      modeling.updateWaypoints(conn, rounded)
    }
    rounding.delete(conn.id)
  })
}
WaypointRounder.$inject = ['eventBus', 'modeling', 'layouter', 'elementRegistry']

export default {
  __init__: ['connectionImportNormalizer', 'waypointRounder'],
  layouter: ['type', BizagiLayouter],
  connectionImportNormalizer: ['type', ConnectionImportNormalizer],
  waypointRounder: ['type', WaypointRounder],
}