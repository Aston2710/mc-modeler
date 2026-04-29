/**
 * StrictOrthogonalLayouter
 *
 * Replaces BpmnLayouter as the 'layouter' service.
 * Never produces diagonal connections — when BpmnLayouter's repairConnection()
 * falls back to [start, end] (a diagonal line), we intercept and build a proper
 * Z-shaped / L-shaped orthogonal path instead.
 *
 * Four-tier strategy:
 *   0. Gateway connections: route to/from the exact cardinal tip (top/right/bottom/left)
 *      so CroppingConnectionDocking always crops at a diamond vertex, not a random edge.
 *   1. Run BpmnLayouter normally (respects boundary-event routing rules, etc.).
 *   2. If result is diagonal, retry with element CENTERS as start/end.
 *   3. If still diagonal, buildOrthogonalPath() — always 100% orthogonal.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import BpmnLayouter from 'bpmn-js/lib/features/modeling/BpmnLayouter'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { getMid } from 'diagram-js/lib/layout/LayoutUtil'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { withoutRedundantPoints } from 'diagram-js/lib/layout/ManhattanLayout'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'

type Point = { x: number; y: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyShape = any

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasDiagonals(waypoints: Point[] | null | undefined): boolean {
  if (!waypoints || waypoints.length < 2) return false
  for (let i = 1; i < waypoints.length; i++) {
    const dx = Math.abs(waypoints[i].x - waypoints[i - 1].x)
    const dy = Math.abs(waypoints[i].y - waypoints[i - 1].y)
    if (dx > 2 && dy > 2) return true
  }
  return false
}

/**
 * Build a guaranteed-orthogonal path from start → end.
 *
 * If points are already H/V aligned → 2-segment straight line.
 * Otherwise → 3-segment Z-shape:
 *   h:h (horizontal dominant) → horiz → vert → horiz
 *   v:v (vertical dominant)   → vert  → horiz → vert
 */
function buildOrthogonalPath(
  start: Point,
  end: Point,
  source: AnyShape,
  target: AnyShape,
): Point[] {
  const sx = start.x, sy = start.y
  const tx = end.x, ty = end.y
  const TOLERANCE = 2

  if (Math.abs(sy - ty) <= TOLERANCE) return [{ x: sx, y: sy }, { x: tx, y: ty }]
  if (Math.abs(sx - tx) <= TOLERANCE) return [{ x: sx, y: sy }, { x: tx, y: ty }]

  const horizDist = Math.abs(
    (target.x + target.width / 2) - (source.x + source.width / 2)
  )
  const vertDist = Math.abs(
    (target.y + target.height / 2) - (source.y + source.height / 2)
  )

  if (horizDist >= vertDist) {
    const midX = Math.round((sx + tx) / 2)
    return [
      { x: sx, y: sy },
      { x: midX, y: sy },
      { x: midX, y: ty },
      { x: tx, y: ty },
    ]
  } else {
    const midY = Math.round((sy + ty) / 2)
    return [
      { x: sx, y: sy },
      { x: sx, y: midY },
      { x: tx, y: midY },
      { x: tx, y: ty },
    ]
  }
}

// ── Gateway tip routing ───────────────────────────────────────────────────────

function isGateway(element: AnyShape): boolean {
  const bo = element?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

/**
 * Returns the cardinal tip (top/right/bottom/left) of a gateway diamond
 * that faces the other element.
 *
 * Normalizes dx/dy by the half-extents of the diamond so that a gateway
 * that is wider than it is tall still picks the correct axis.
 */
function getGatewayTip(gateway: AnyShape, other: AnyShape): Point {
  const cx = gateway.x + gateway.width / 2
  const cy = gateway.y + gateway.height / 2
  const ox = other.x + other.width / 2
  const oy = other.y + other.height / 2

  const dx = ox - cx
  const dy = oy - cy
  const dxNorm = Math.abs(dx) / (gateway.width / 2)
  const dyNorm = Math.abs(dy) / (gateway.height / 2)

  if (dxNorm >= dyNorm) {
    return dx >= 0
      ? { x: gateway.x + gateway.width, y: cy }  // right tip
      : { x: gateway.x, y: cy }                   // left tip
  } else {
    return dy >= 0
      ? { x: cx, y: gateway.y + gateway.height }  // bottom tip
      : { x: cx, y: gateway.y }                   // top tip
  }
}

/**
 * A top/bottom tip exits vertically; a left/right tip exits horizontally.
 * We detect by checking whether the tip x-coordinate equals the gateway center x.
 */
function tipIsVertical(tip: Point, gateway: AnyShape): boolean {
  const cx = gateway.x + gateway.width / 2
  return Math.abs(tip.x - cx) < 2
}

/**
 * Build an orthogonal path that respects the exit/entry axis imposed by gateway tips.
 *
 * srcExitsVertically  true  → first segment is vertical  (top/bottom tip)
 * tgtEntersVertically true  → last  segment is vertical  (top/bottom tip)
 *
 * Combinations:
 *   V→H or H→V : L-shape  (3 points)
 *   V→V        : Z-shape  vert → horiz → vert  (4 points)
 *   H→H        : Z-shape  horiz → vert → horiz (4 points)
 */
function buildGatewayPath(
  start: Point,
  end: Point,
  srcExitsVertically: boolean,
  tgtEntersVertically: boolean,
): Point[] {
  if (srcExitsVertically !== tgtEntersVertically) {
    // L-shape
    if (srcExitsVertically) {
      return [start, { x: start.x, y: end.y }, end]
    } else {
      return [start, { x: end.x, y: start.y }, end]
    }
  } else if (srcExitsVertically) {
    // Both vertical: v → h → v
    const midY = Math.round((start.y + end.y) / 2)
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
  } else {
    // Both horizontal: h → v → h
    const midX = Math.round((start.x + end.x) / 2)
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
  }
}

// ── Post-import normalizer ───────────────────────────────────────────────────

/**
 * Fixes diagonal connections that come in from imported XML.
 * layoutConnection is NOT called during bpmn-js import — waypoints from DI
 * are used as-is. This behavior listens for import.render.complete, re-routes
 * any connection that still has diagonals, then clears the undo stack so the
 * corrections are transparent to the user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConnectionImportNormalizer(eventBus: any, elementRegistry: any, modeling: any, layouter: any, commandStack: any) {
  eventBus.on('import.render.complete', 100, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connections: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elementRegistry.forEach((el: any) => {
      if (el.waypoints) connections.push(el)
    })

    let fixed = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connections.forEach((conn: any) => {
      if (!conn.source || !conn.target) return
      if (!hasDiagonals(conn.waypoints)) return

      const newWaypoints = layouter.layoutConnection(conn, {
        source: conn.source,
        target: conn.target,
      })
      if (newWaypoints && newWaypoints.length >= 2) {
        modeling.updateWaypoints(conn, newWaypoints)
        fixed++
      }
    })

    if (fixed > 0) {
      // Clear undo stack so import corrections are not undoable
      commandStack.clear()
    }
  })
}

ConnectionImportNormalizer.$inject = ['eventBus', 'elementRegistry', 'modeling', 'layouter', 'commandStack']

// ── Layouter ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StrictOrthogonalLayouter(this: any, elementRegistry: unknown) {
  BpmnLayouter.call(this, elementRegistry)
}

inherits(StrictOrthogonalLayouter, BpmnLayouter)
StrictOrthogonalLayouter.$inject = ['elementRegistry']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
StrictOrthogonalLayouter.prototype.layoutConnection = function (connection: any, hints: any) {
  hints = hints || {}

  const source: AnyShape = hints.source || connection.source
  const target: AnyShape = hints.target || connection.target

  if (!source || !target || source === target) {
    return BpmnLayouter.prototype.layoutConnection.call(this, connection, hints)
  }

  // ── Tier 0: gateway cardinal tip routing ─────────────────────────────────
  // Force connections to/from gateways to attach at the 4 diamond cardinal tips.
  // CroppingConnectionDocking will then crop at exactly the tip because the path
  // segment nearest the gateway is perpendicular to the diamond face at that point.
  const srcIsGateway = isGateway(source)
  const tgtIsGateway = isGateway(target)

  if (srcIsGateway || tgtIsGateway) {
    const srcTip: Point = srcIsGateway ? getGatewayTip(source, target) : getMid(source)
    const tgtTip: Point = tgtIsGateway ? getGatewayTip(target, source) : getMid(target)

    let srcExitsVertically: boolean
    let tgtEntersVertically: boolean

    if (srcIsGateway) {
      srcExitsVertically = tipIsVertical(srcTip, source)
    } else {
      // Non-gateway source: choose exit direction complementary to target entry
      // so the path forms a clean L-shape rather than a U or Z.
      srcExitsVertically = !tipIsVertical(tgtTip, target)
    }

    if (tgtIsGateway) {
      tgtEntersVertically = tipIsVertical(tgtTip, target)
    } else {
      // Non-gateway target: choose entry direction complementary to source exit.
      tgtEntersVertically = !srcExitsVertically
    }

    return withoutRedundantPoints(
      buildGatewayPath(srcTip, tgtTip, srcExitsVertically, tgtEntersVertically)
    )
  }

  // ── Tier 1: normal BpmnLayouter ──────────────────────────────────────────
  const result1 = BpmnLayouter.prototype.layoutConnection.call(this, connection, hints)
  if (result1 && !hasDiagonals(result1)) return result1

  // ── Tier 2: retry with element CENTERS as anchors ────────────────────────
  const centerHints = {
    ...hints,
    connectionStart: getMid(source),
    connectionEnd: getMid(target),
  }
  const result2 = BpmnLayouter.prototype.layoutConnection.call(this, connection, centerHints)
  if (result2 && !hasDiagonals(result2)) return result2

  // ── Tier 3: guaranteed orthogonal fallback ────────────────────────────────
  const s = getMid(source)
  const t = getMid(target)
  return withoutRedundantPoints(buildOrthogonalPath(s, t, source, target))
}

export default {
  __init__: ['connectionImportNormalizer'],
  layouter: ['type', StrictOrthogonalLayouter],
  connectionImportNormalizer: ['type', ConnectionImportNormalizer],
}
