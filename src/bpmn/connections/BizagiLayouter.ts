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

function gatewayFace(gw: Shape, other: Shape): Face {
  const dx = cx(other) - cx(gw)
  const dy = cy(other) - cy(gw)
  if (Math.abs(dx) > Math.abs(dy) * 1.5) return dx >= 0 ? 'right' : 'left'
  if (Math.abs(dy) > Math.abs(dx) * 1.5) return dy >= 0 ? 'bottom' : 'top'
  return dy >= 0 ? 'bottom' : 'top'
}

function defaultFace(src: Shape, tgt: Shape): Face {
  const dx = cx(tgt) - cx(src)
  const dy = cy(tgt) - cy(src)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function isShapeCenter(shape: Shape, p: Point): boolean {
  return Math.abs(p.x - cx(shape)) < 1 && Math.abs(p.y - cy(shape)) < 1
}

function pickFacesMultiConn(src: Shape, tgt: Shape, connection: Connection): [Face, Face] {
  const r1 = { left: src.x, right: src.x + src.width,  top: src.y, bottom: src.y + src.height }
  const r2 = { left: tgt.x, right: tgt.x + tgt.width,  top: tgt.y, bottom: tgt.y + tgt.height }

  const outCount = ((src.outgoing || []) as Connection[]).filter(c => c !== connection).length
  const inCount  = ((tgt.incoming || []) as Connection[]).filter(c => c !== connection).length

  let sFace: Face = defaultFace(src, tgt)
  let tFace: Face = defaultFace(tgt, src)

  if (isGateway(src)) sFace = gatewayFace(src, tgt)
  if (isGateway(tgt)) tFace = gatewayFace(tgt, src)

  if (r1.right < r2.left) {
    const hDist = r2.left - r1.right
    if (inCount > 0) {
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
    if (outCount > 0) {
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
    if (r1.top > r2.bottom) {
      sFace = 'top'; tFace = 'bottom'
    } else if (r1.bottom < r2.top) {
      sFace = 'bottom'; tFace = 'top'
    } else {
      sFace = 'top'; tFace = 'top'
    }
  } else if (r1.top > r2.bottom) {
    const hasBackline = ((src.incoming || []) as Connection[]).some(c =>
      c !== connection && c.source?.id === tgt.id
    )
    if (hasBackline) {
      sFace = 'right'; tFace = 'right'
    } else {
      sFace = 'top'; tFace = 'bottom'
    }
  } else {
    sFace = 'bottom'; tFace = 'top'
  }

  return [sFace, tFace]
}

function pickFace(shape: Shape, other: Shape, hint?: Point, shapeMoveMode?: boolean): Face {
  if (!shapeMoveMode && hint && !isShapeCenter(shape, hint)) {
    return isGateway(shape) ? nearestGatewayFace(shape, hint) : nearestFace(shape, hint)
  }
  if (isGateway(shape)) return gatewayFace(shape, other)
  return defaultFace(shape, other)
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
                     || hasMovedAnchor

  let sFace: Face
  let tFace: Face

  const outCount = ((src.outgoing || []) as Connection[]).filter((c: Connection) => c !== connection).length
  const inCount  = ((tgt.incoming || []) as Connection[]).filter((c: Connection) => c !== connection).length
  const hasMultiConn = outCount > 0 || inCount > 0

  if (hasMultiConn) {
    ;[sFace, tFace] = pickFacesMultiConn(src, tgt, connection)
  } else if (shapeMoveMode) {
    sFace = pickFace(src, tgt, undefined, true)
    tFace = pickFace(tgt, src, undefined, true)
  } else if (hints.connectionStart || hints.connectionEnd) {
    sFace = pickFace(src, tgt, hints.connectionStart, false)
    tFace = pickFace(tgt, src, hints.connectionEnd,   false)
  } else {
    sFace = pickFace(src, tgt)
    tFace = pickFace(tgt, src)
  }

  let start = isGateway(src) ? gatewayCardinal(src, sFace) : faceCardinal(src, sFace)
  let end   = isGateway(tgt) ? gatewayCardinal(tgt, tFace) : faceCardinal(tgt, tFace)

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
  const isDragging = ('connectionStart' in hints) || ('connectionEnd' in hints) || ('waypoints' in hints) || hasMovedAnchor
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
      prevEndDir = segDx2 > 0 ? 'right' : 'left'
    } else if (Math.abs(segDy2) > 0) {
      prevEndDir = segDy2 > 0 ? 'bottom' : 'top'
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
      if (!hasDiagonals(conn.waypoints)) return
      const wp = layouter.layoutConnection(conn, { source: conn.source, target: conn.target })
      if (wp?.length >= 2) { modeling.updateWaypoints(conn, wp); fixed++ }
    })

    if (fixed > 0) commandStack.clear()
  })
}
ConnectionImportNormalizer.$inject = ['eventBus', 'elementRegistry', 'modeling', 'layouter', 'commandStack']

export default {
  __init__: ['connectionImportNormalizer'],
  layouter: ['type', BizagiLayouter],
  connectionImportNormalizer: ['type', ConnectionImportNormalizer],
}