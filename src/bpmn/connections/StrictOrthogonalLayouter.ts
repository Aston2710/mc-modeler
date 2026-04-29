/**
 * StrictOrthogonalLayouter
 *
 * Replaces BpmnLayouter as the 'layouter' service.
 * Never produces diagonal connections — when BpmnLayouter's repairConnection()
 * falls back to [start, end] (a diagonal line), we intercept and build a proper
 * Z-shaped / L-shaped orthogonal path instead.
 *
 * Three-tier strategy:
 *   1. Run BpmnLayouter normally (respects gateway/boundary-event routing rules).
 *   2. If result is diagonal, retry with element CENTERS as start/end
 *      (element centers remove border-point confusion).
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

  // Already aligned?
  if (Math.abs(sy - ty) <= TOLERANCE) return [{ x: sx, y: sy }, { x: tx, y: ty }]
  if (Math.abs(sx - tx) <= TOLERANCE) return [{ x: sx, y: sy }, { x: tx, y: ty }]

  // Choose direction based on relative element-center distances
  const horizDist = Math.abs(
    (target.x + target.width / 2) - (source.x + source.width / 2)
  )
  const vertDist = Math.abs(
    (target.y + target.height / 2) - (source.y + source.height / 2)
  )

  if (horizDist >= vertDist) {
    // h:h layout: horiz → vert → horiz
    const midX = Math.round((sx + tx) / 2)
    return [
      { x: sx, y: sy },
      { x: midX, y: sy },
      { x: midX, y: ty },
      { x: tx, y: ty },
    ]
  } else {
    // v:v layout: vert → horiz → vert
    const midY = Math.round((sy + ty) / 2)
    return [
      { x: sx, y: sy },
      { x: sx, y: midY },
      { x: tx, y: midY },
      { x: tx, y: ty },
    ]
  }
}

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

  // ── Tier 1: normal BpmnLayouter ──────────────────────────────────────────
  const result1 = BpmnLayouter.prototype.layoutConnection.call(this, connection, hints)
  if (result1 && !hasDiagonals(result1)) return result1

  // ── Tier 2: retry with element CENTERS as anchors ────────────────────────
  // repairConnection fails when connectionStart/End are at shape BORDERS
  // (from CroppingConnectionDocking or custom docking) instead of centers.
  // Using getMid() removes that ambiguity.
  const centerHints = {
    ...hints,
    connectionStart: getMid(source),
    connectionEnd: getMid(target),
  }
  const result2 = BpmnLayouter.prototype.layoutConnection.call(this, connection, centerHints)
  if (result2 && !hasDiagonals(result2)) return result2

  // ── Tier 3: guaranteed orthogonal fallback ────────────────────────────────
  // BpmnLayouter.repairConnection fell back to [start, end] (diagonal).
  // Build a strict Z-shaped path — never diagonal.
  const s = getMid(source)
  const t = getMid(target)
  return withoutRedundantPoints(buildOrthogonalPath(s, t, source, target))
}

export default {
  layouter: ['type', StrictOrthogonalLayouter],
}
