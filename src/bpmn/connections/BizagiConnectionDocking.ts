/**
 * BizagiConnectionDocking.ts
 *
 * Intercepta el recorte visual de conexiones para que el punto de anclaje
 * siempre aparezca en el borde real del shape (no en el centro geométrico).
 *
 * Cambios respecto a la versión anterior:
 *  - try/catch en getShapePath() → no explota durante drag ni import
 *  - shapeEdgePoint() como fallback geométrico cuando el SVG no está listo
 *  - Protección para waypoints vacíos/nulos
 *  - Soporte mejorado para gateways con intersección precisa del diamante
 */

// @ts-ignore
import { getElementLineIntersection } from 'diagram-js/lib/layout/LayoutUtil'

type Point = { x: number; y: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any

function isGateway(shape: Shape): boolean {
  const bo = shape?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

// ── Diamond intersection ──────────────────────────────────────────────────────

function getDiamondDockingPoint(shape: Shape, inner: Point, endpoint?: Point): Point {
  const mcx = shape.x + shape.width  / 2
  const mcy = shape.y + shape.height / 2

  const top:    Point = { x: mcx,                    y: shape.y }
  const right:  Point = { x: shape.x + shape.width,  y: mcy }
  const bottom: Point = { x: mcx,                    y: shape.y + shape.height }
  const left:   Point = { x: shape.x,                y: mcy }
  const vertices = [top, right, bottom, left]

  // Si el endpoint (waypoint[0] o waypoint[last]) ya ES exactamente un vértice cardinal,
  // lo devolvemos directamente — no hay interseción que calcular.
  if (endpoint) {
    for (const v of vertices) {
      if (Math.abs(endpoint.x - v.x) < 0.5 && Math.abs(endpoint.y - v.y) < 0.5) {
        return v
      }
    }
  }

  // Si el segmento inner→endpoint es perfectamente ortogonal (H o V),
  // snap al vértice cardinal más próximo al inner en esa dirección.
  // Esto evita que una línea horizontal que llega al vértice derecho calcule
  // una intersección diagonal con el rombo.
  if (endpoint) {
    if (Math.abs(inner.y - endpoint.y) < 0.5) {
      // Segmento horizontal: el docking es Left o Right
      return inner.x < endpoint.x ? right : left
    }
    if (Math.abs(inner.x - endpoint.x) < 0.5) {
      // Segmento vertical: el docking es Top o Bottom
      return inner.y < endpoint.y ? bottom : top
    }
  }

  // Fallback: intersección geométrica general (para conexiones no rectas)
  const dx = mcx - inner.x
  const dy = mcy - inner.y

  if (Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) return top

  const edges: [Point, Point][] = [
    [top, right], [right, bottom], [bottom, left], [left, top],
  ]

  let best: Point | null = null
  let bestT = Infinity

  for (const [a, b] of edges) {
    const dax = b.x - a.x
    const day = b.y - a.y
    const denom = dx * day - dy * dax
    if (Math.abs(denom) < 1e-10) continue

    const t = ((a.x - inner.x) * day - (a.y - inner.y) * dax) / denom
    const u = ((a.x - inner.x) * dy  - (a.y - inner.y) * dx)  / denom

    if (u < -1e-10 || u > 1 + 1e-10) continue
    if (Math.abs(t) < Math.abs(bestT)) {
      bestT = t
      best = {
        x: Math.round(inner.x + t * dx),
        y: Math.round(inner.y + t * dy),
      }
    }
  }

  if (best) return best

  return vertices.reduce((b, v) =>
    Math.hypot(v.x - inner.x, v.y - inner.y) < Math.hypot(b.x - inner.x, b.y - inner.y) ? v : b
  )
}

// ── Fallback geométrico ───────────────────────────────────────────────────────

/**
 * Calcula el punto de borde del shape más cercano a `reference`
 * cuando getShapePath/getElementLineIntersection no está disponible.
 */
function shapeEdgePoint(shape: Shape, reference: Point): Point {
  const mcx = shape.x + shape.width  / 2
  const mcy = shape.y + shape.height / 2
  const dx = reference.x - mcx
  const dy = reference.y - mcy

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { x: shape.x + shape.width, y: mcy }
      : { x: shape.x,               y: mcy }
  } else {
    return dy >= 0
      ? { x: mcx, y: shape.y + shape.height }
      : { x: mcx, y: shape.y }
  }
}

// ── BizagiConnectionDocking ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiConnectionDocking(this: any, graphicsFactory: any) {
  this._graphicsFactory = graphicsFactory
}
BizagiConnectionDocking.$inject = ['graphicsFactory']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiConnectionDocking.prototype.getCroppedWaypoints = function (connection: any, source: any, target: any): Point[] {
  source = source || connection.source
  target = target || connection.target

  if (!source || !target) return connection.waypoints || []

  const sourceDocking = this.getDockingPoint(connection, source, true)
  const targetDocking = this.getDockingPoint(connection, target, false)

  const wps: Point[] = connection.waypoints || []
  const inner = wps.slice(sourceDocking.idx + 1, targetDocking.idx)

  const first: Point & { original?: Point } = {
    ...sourceDocking.actual,
    original: (sourceDocking.point as Point & { original?: Point }).original || sourceDocking.point,
  }
  const last: Point & { original?: Point } = {
    ...targetDocking.actual,
    original: (targetDocking.point as Point & { original?: Point }).original || targetDocking.point,
  }

  return [first, ...inner, last]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiConnectionDocking.prototype.getDockingPoint = function (connection: any, shape: Shape, dockStart: boolean) {
  const wps: Point[] = connection.waypoints || []
  const idx = dockStart ? 0 : wps.length - 1
  const endpoint = wps[idx]

  if (!endpoint || wps.length < 2) {
    const c: Point = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
    return { point: c, actual: c, idx }
  }

  if (isGateway(shape)) {
    const innerIdx = dockStart ? 1 : wps.length - 2
    const inner = wps[innerIdx] || endpoint
    const actual = getDiamondDockingPoint(shape, inner, endpoint)
    return { point: endpoint, actual, idx }
  }

  const innerIdx = dockStart ? 1 : wps.length - 2
  const inner = wps[innerIdx] || endpoint

  let cropped: Point | null = null
  try {
    const shapePath: string = this._graphicsFactory.getShapePath(shape)
    if (shapePath) {
      const linePath = `M${inner.x},${inner.y} L${endpoint.x},${endpoint.y}`
      cropped = getElementLineIntersection(shapePath, linePath, false) as Point | null
    }
  } catch {
    cropped = null
  }

  if (!cropped) {
    cropped = shapeEdgePoint(shape, inner)
  }

  return { point: endpoint, actual: cropped, idx }
}

export default {
  connectionDocking: ['type', BizagiConnectionDocking],
}
