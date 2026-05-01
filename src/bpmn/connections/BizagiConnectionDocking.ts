/**
 * BizagiConnectionDocking
 *
 * - Gateway shapes: intersects the line (inner-waypoint → shape-center) against
 *   the 4 diamond edges to find the exact docking point on the diamond border.
 * - All other shapes: delegates to the native CroppingConnectionDocking logic
 *   (getElementLineIntersection against getShapePath).
 *
 * getCroppedWaypoints replaces only first and last waypoints; intermediates unchanged.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { getElementLineIntersection } from 'diagram-js/lib/layout/LayoutUtil'
import { snapToNearestSlot } from './BizagiPortDistributor'

type Point = { x: number; y: number }
type Face = 'top' | 'bottom' | 'left' | 'right'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any

function nearestFaceFromPoint(shape: Shape, p: Point): Face {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2
  const candidates: [Face, number][] = [
    ['top',    Math.hypot(p.x - cx,                      p.y - shape.y)],
    ['bottom', Math.hypot(p.x - cx,                      p.y - (shape.y + shape.height))],
    ['left',   Math.hypot(p.x - shape.x,                 p.y - cy)],
    ['right',  Math.hypot(p.x - (shape.x + shape.width), p.y - cy)],
  ]
  return candidates.sort((a, b) => a[1] - b[1])[0][0]
}

function isGateway(shape: Shape): boolean {
  const bo = shape?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

// ── Diamond intersection ──────────────────────────────────────────────────────

/**
 * Returns the intersection of the line (from `inner` toward shape center) with
 * one of the 4 diamond edges. Falls back to the nearest cardinal vertex.
 *
 * `inner` is the waypoint just before the gateway endpoint (outside the shape).
 * The line direction is inner → center, so t=0 is inner, t=1 is center.
 * The first intersection with t > 0 is the diamond border point.
 */
function getDiamondDockingPoint(shape: Shape, inner: Point): Point {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2
  const top:    Point = { x: cx,                     y: shape.y }
  const right:  Point = { x: shape.x + shape.width,  y: cy }
  const bottom: Point = { x: cx,                     y: shape.y + shape.height }
  const left:   Point = { x: shape.x,                y: cy }

  // Direction from inner toward center
  const dx = cx - inner.x
  const dy = cy - inner.y

  if (Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) {
    return top // degenerate: inner is at center
  }

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
      best = { x: Math.round(inner.x + t * dx), y: Math.round(inner.y + t * dy) }
    }
  }
  if (best) return best

  // Fallback: nearest cardinal vertex to inner
  return [top, right, bottom, left].reduce((best, v) =>
    Math.hypot(v.x - inner.x, v.y - inner.y) < Math.hypot(best.x - inner.x, best.y - inner.y) ? v : best
  )
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

  const sourceDocking = this.getDockingPoint(connection, source, true)
  const targetDocking = this.getDockingPoint(connection, target, false)

  const wps: Point[] = connection.waypoints
  const inner = wps.slice(sourceDocking.idx + 1, targetDocking.idx)

  const first: Point & { original?: Point } = {
    ...sourceDocking.actual,
    original: (sourceDocking.point as any).original || sourceDocking.point,
  }
  const last: Point & { original?: Point } = {
    ...targetDocking.actual,
    original: (targetDocking.point as any).original || targetDocking.point,
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
    const inner = wps[innerIdx]
    const actual = getDiamondDockingPoint(shape, inner)
    return { point: endpoint, actual, idx }
  }

  // Non-gateway: intersect segment inner→endpoint against shapePath.
  // Avoids getConnectionPath which reads rendered SVG (unreliable during drag/import).
  const innerIdx = dockStart ? 1 : wps.length - 2
  const inner = wps[innerIdx] || endpoint
  const shapePath: string = this._graphicsFactory.getShapePath(shape)
  const twoPointPath = `M${inner.x},${inner.y} L${endpoint.x},${endpoint.y}`
  const cropped: Point | null = getElementLineIntersection(shapePath, twoPointPath, false)
  const dockPoint = cropped || endpoint
  const face = nearestFaceFromPoint(shape, dockPoint)
  const totalOnFace = dockStart
    ? ((connection.source?.outgoing?.length) || 1)
    : ((connection.target?.incoming?.length) || 1)
  const snapped = snapToNearestSlot(shape, face, dockPoint, totalOnFace)
  return { point: endpoint, actual: snapped, idx }
}

export default {
  connectionDocking: ['type', BizagiConnectionDocking],
}
