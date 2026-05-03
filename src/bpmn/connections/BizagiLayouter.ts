/**
 * BizagiLayouter.ts
 *
 * CORRECCIONES respecto a versión anterior:
 *
 * FIX C — nearestGatewayFace: para gateways, nearestFace calcula distancia
 *   al CENTRO de cada cara rectangular (que no existe en un rombo).
 *   La función correcta calcula distancia al VÉRTICE de cada cara del diamante.
 *   Así, si el hint del ratón viene de arriba-derecha, se asigna el vértice
 *   superior o derecho correctamente según cuál está más cerca.
 *
 * FIX D — BizagiDragRouter eliminado.
 *   Interceptar shape.move y modificar conn.waypoints directamente no funciona:
 *   bpmn-js re-renderiza con sus propios waypoints después, sobreescribiendo los nuestros.
 *   La solución correcta es que el layouter (este archivo) sea invocado por
 *   bpmn-js a través del canal oficial 'layouter' service, que SÍ ocurre
 *   automáticamente cuando un shape conectado se mueve.
 *   No se necesita ningún módulo extra para el drag — bpmn-js llama a
 *   layoutConnection() del servicio 'layouter' registrado en cada movimiento.
 */

import { BizagiDirectionalRouter } from './BizagiDirectionalRouter'
import type { Point, RouterObstacle } from './BizagiDirectionalRouter'

type Face = 'top' | 'bottom' | 'left' | 'right'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Connection = any

const PORT_OFFSET = 15

function cx(s: Shape): number { return s.x + s.width  / 2 }
function cy(s: Shape): number { return s.y + s.height / 2 }

function isGateway(el: Shape): boolean {
  const bo = el?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

function isConnector(el: Shape): boolean { return Array.isArray(el?.waypoints) }

function toObstacle(s: Shape): RouterObstacle {
  return { x: s.x, y: s.y, width: s.width, height: s.height }
}

// ── Cardinal face ─────────────────────────────────────────────────────────────

function faceCardinal(s: Shape, face: Face): Point {
  switch (face) {
    case 'top':    return { x: cx(s), y: s.y }
    case 'bottom': return { x: cx(s), y: s.y + s.height }
    case 'left':   return { x: s.x,           y: cy(s) }
    case 'right':  return { x: s.x + s.width, y: cy(s) }
  }
}

/** Vértice del diamante para la cara indicada */
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

function isHoriz(face: Face): boolean { return face === 'left' || face === 'right' }

/** Cara más cercana para shapes rectangulares — distancia al centro de cada cara */
function nearestFace(s: Shape, p: Point): Face {
  const d: [Face, number][] = [
    ['top',    Math.hypot(p.x - cx(s), p.y - s.y)],
    ['bottom', Math.hypot(p.x - cx(s), p.y - (s.y + s.height))],
    ['left',   Math.hypot(p.x - s.x,             p.y - cy(s))],
    ['right',  Math.hypot(p.x - (s.x + s.width), p.y - cy(s))],
  ]
  return d.sort((a, b) => a[1] - b[1])[0][0]
}

/**
 * FIX C: Para gateways (rombos), la cara más cercana se calcula como
 * distancia al VÉRTICE de cada cara, no al centro del lado.
 * Los 4 vértices del diamante son exactamente los puntos cardinales.
 */
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

function pickFace(shape: Shape, other: Shape, hint?: Point, shapeMoveMode?: boolean): Face {
  if (!shapeMoveMode && hint && !isShapeCenter(shape, hint)) {
    // FIX C: usar nearestGatewayFace para gateways cuando hay hint del ratón
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

// ── BizagiLayouter ────────────────────────────────────────────────────────────

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
  const sFace = pickFace(src, tgt, shapeMoveMode ? undefined : hints.connectionStart, shapeMoveMode)
  const tFace = pickFace(tgt, src, shapeMoveMode ? undefined : hints.connectionEnd,   shapeMoveMode)

  let start = isGateway(src) ? gatewayCardinal(src, sFace) : faceCardinal(src, sFace)
  let end   = isGateway(tgt) ? gatewayCardinal(tgt, tFace) : faceCardinal(tgt, tFace)

  // Port offset
  let sameOut = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const conn of (src.outgoing || []) as any[]) {
    if (conn === connection || !conn.waypoints?.length) continue
    const wp0 = conn.waypoints[0]
    const face = isGateway(src) ? nearestGatewayFace(src, wp0) : nearestFace(src, wp0)
    if (face === sFace) sameOut++
  }
  if (sameOut > 0) {
    const off = sameOut * PORT_OFFSET
    start = isHoriz(sFace) ? { x: start.x, y: start.y + off } : { x: start.x + off, y: start.y }
  }

  let sameIn = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const conn of (tgt.incoming || []) as any[]) {
    if (conn === connection || !conn.waypoints?.length) continue
    const lastWp = conn.waypoints[conn.waypoints.length - 1]
    const face = isGateway(tgt) ? nearestGatewayFace(tgt, lastWp) : nearestFace(tgt, lastWp)
    if (face === tFace) sameIn++
  }
  if (sameIn > 0) {
    const off = sameIn * PORT_OFFSET
    end = isHoriz(tFace) ? { x: end.x, y: end.y + off } : { x: end.x + off, y: end.y }
  }

  // Recolectar obstáculos
  const obstacles: RouterObstacle[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this._elementRegistry.forEach((el: any) => {
    if (isConnector(el)) return
    if (!el.width || !el.height) return
    if (!el.parent) return
    const obs = toObstacle(el)
    if (el === src) return
    if (el === tgt) return
    obstacles.push(obs)
  })

  const router: BizagiDirectionalRouter = this._router

  // Detect drag/modification hints to try and preserve existing route
  const isDragging = ('connectionStart' in hints) || ('connectionEnd' in hints) || ('waypoints' in hints) || hasMovedAnchor
  const existingWaypoints = isDragging && connection.waypoints ? connection.waypoints : undefined

  return router.calculateRoute(start, end, sFace as Face, tFace as Face, obstacles, existingWaypoints)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.repairConnection = function (connection: Connection, _newEnd: any, hints: any): Point[] {
  return this.layoutConnection(connection, hints || {})
}

// ── ConnectionImportNormalizer ────────────────────────────────────────────────

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
