/**
 * StrictOrthogonalLayouter — Anclaje Cardinal Discreto + Evasión de Cajas
 *
 * Pilares:
 *   1. Hint-Aware: si hints.connectionStart/End existen, ancla al cardinal más
 *      cercano (libre albedrío del usuario). Sin hint → delta de centros.
 *   2. Evasión de cajas: connectRectangles() del motor nativo manhattan —
 *      jamás cruza por dentro de un shape, genera U-turns seguros.
 *   3. Retorno limpio: withoutRedundantPoints() elimina vértices redundantes.
 *
 *   BpmnLayouter solo como fallback extremo (sin dimensiones / auto-conexión).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import BpmnLayouter from 'bpmn-js/lib/features/modeling/BpmnLayouter'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { connectRectangles, withoutRedundantPoints } from 'diagram-js/lib/layout/ManhattanLayout'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'

type Point = { x: number; y: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyShape = any

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasDiagonals(waypoints: Point[] | null | undefined): boolean {
  if (!waypoints || waypoints.length < 2) return false
  for (let i = 1; i < waypoints.length; i++) {
    const dx = Math.abs(waypoints[i].x - waypoints[i - 1].x)
    const dy = Math.abs(waypoints[i].y - waypoints[i - 1].y)
    if (dx > 2 && dy > 2) return true
  }
  return false
}

/** Los 4 puntos cardinales medios de un shape rectangular */
function cardinals(shape: AnyShape): {
  top: Point; bottom: Point; left: Point; right: Point; cx: number; cy: number
} {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2
  return {
    cx, cy,
    top:    { x: cx,                    y: shape.y                },
    bottom: { x: cx,                    y: shape.y + shape.height },
    left:   { x: shape.x,               y: cy                    },
    right:  { x: shape.x + shape.width, y: cy                    },
  }
}

/** Snaps a point to the nearest cardinal of shape */
function snapToCardinal(shape: AnyShape, hint: Point): Point {
  const c = cardinals(shape)
  const candidates: Point[] = [c.top, c.bottom, c.left, c.right]
  let best = candidates[0]
  let bestDist = Infinity
  for (const p of candidates) {
    const d = Math.hypot(p.x - hint.x, p.y - hint.y)
    if (d < bestDist) { bestDist = d; best = p }
  }
  return best
}

// ── Gateway tip ───────────────────────────────────────────────────────────────

function isGateway(element: AnyShape): boolean {
  const bo = element?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

/** Cardinal tip del diamante que mira hacia other */
function getGatewayTip(gateway: AnyShape, other: AnyShape): Point {
  const cx = gateway.x + gateway.width / 2
  const cy = gateway.y + gateway.height / 2
  const dx = (other.x + other.width / 2) - cx
  const dy = (other.y + other.height / 2) - cy
  const dxNorm = Math.abs(dx) / (gateway.width / 2)
  const dyNorm = Math.abs(dy) / (gateway.height / 2)

  if (dxNorm >= dyNorm) {
    return dx >= 0
      ? { x: gateway.x + gateway.width, y: cy }
      : { x: gateway.x, y: cy }
  } else {
    return dy >= 0
      ? { x: cx, y: gateway.y + gateway.height }
      : { x: cx, y: gateway.y }
  }
}

// ── Anchor picker — el núcleo hint-aware ──────────────────────────────────────

/**
 * Extrae la posición de arrastre/intención del usuario de los hints.
 * diagram-js puede publicarla en connectionStart/End, dragPosition, o point.
 * Cualquiera de los tres es suficiente para activar el magnetismo cardinal.
 */
function resolveHintPoint(
  explicitPoint: Point | undefined,
  hints: { dragPosition?: Point; point?: Point },
): Point | undefined {
  return explicitPoint ?? hints.dragPosition ?? hints.point
}

/**
 * Elige el punto de anclaje cardinal para shape.
 *
 * Prioridad:
 *   1. Cualquier posición de arrastre del usuario → snap agresivo al cardinal
 *      más cercano. El usuario manda absoluto (tasks Y gateways).
 *   2. Sin posición de arrastre + gateway → tip del diamante calculado.
 *   3. Sin ninguna pista → delta de centros (conexión automática).
 *
 * El magnetismo es intencional: si el ratón está cerca de la cara izquierda,
 * la flecha sale por la izquierda aunque el destino esté a la derecha.
 * connectRectangles generará el U-turn necesario sin atravesar el shape.
 */
function pickAnchor(shape: AnyShape, other: AnyShape, hintPoint: Point | undefined, hints: Record<string, unknown>): Point {
  const pos = resolveHintPoint(hintPoint, hints as { dragPosition?: Point; point?: Point })

  if (pos) {
    return snapToCardinal(shape, pos)
  }

  if (isGateway(shape)) {
    return getGatewayTip(shape, other)
  }

  const sc = cardinals(shape)
  const tc = cardinals(other)
  const dx = tc.cx - sc.cx
  const dy = tc.cy - sc.cy

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? sc.right : sc.left
  } else {
    return dy >= 0 ? sc.bottom : sc.top
  }
}

// ── Post-import normalizer ────────────────────────────────────────────────────

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
      const newWaypoints = layouter.layoutConnection(conn, { source: conn.source, target: conn.target })
      if (newWaypoints && newWaypoints.length >= 2) {
        modeling.updateWaypoints(conn, newWaypoints)
        fixed++
      }
    })

    if (fixed > 0) commandStack.clear()
  })
}

ConnectionImportNormalizer.$inject = ['eventBus', 'elementRegistry', 'modeling', 'layouter', 'commandStack']

// ── Layouter ──────────────────────────────────────────────────────────────────

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

  // Fallback extremo: sin shapes o sin dimensiones
  if (
    !source || !target ||
    !source.width || !source.height ||
    !target.width || !target.height
  ) {
    return BpmnLayouter.prototype.layoutConnection.call(this, connection, hints)
  }

  // Auto-conexión: delegar al motor nativo
  if (source === target) {
    return BpmnLayouter.prototype.layoutConnection.call(this, connection, hints)
  }

  // ── Pilar 1: elegir puntos cardinales (hint-aware) ────────────────────────
  // resolveHintPoint busca connectionStart/End → dragPosition → point en hints.
  const start = pickAnchor(source, target, hints.connectionStart, hints)
  const end   = pickAnchor(target, source, hints.connectionEnd,   hints)

  // ── Pilar 2: enrutamiento nativo con evasión de cajas ────────────────────
  // connectRectangles respeta start/end, genera U-turns seguros y nunca
  // atraviesa el interior de un shape.
  const waypoints = connectRectangles(source, target, start, end, hints)

  // ── Pilar 3: retorno limpio ───────────────────────────────────────────────
  return withoutRedundantPoints(waypoints)
}

export default {
  __init__: ['connectionImportNormalizer'],
  layouter: ['type', StrictOrthogonalLayouter],
  connectionImportNormalizer: ['type', ConnectionImportNormalizer],
}
