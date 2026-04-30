/**
 * StrictOrthogonalLayouter — Anclaje Cardinal Discreto (estilo Bizagi)
 *
 * Cada conexión entre dos shapes normales:
 *   1. Calcula el delta (dx, dy) entre centros absolutos.
 *   2. Elige el par de puntos cardinales medios (Right→Left, Left→Right, Bottom→Top, Top→Bottom).
 *   3. Genera un path 100% ortogonal entre esos dos puntos.
 *
 * BpmnLayouter NUNCA se llama para shape→shape normales.
 * Solo se usa como fallback extremo si source/target no tienen dimensiones.
 *
 * ConnectionImportNormalizer re-rutea conexiones diagonales al importar XML.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import BpmnLayouter from 'bpmn-js/lib/features/modeling/BpmnLayouter'
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

function cardinals(shape: AnyShape): {
  top: Point; bottom: Point; left: Point; right: Point; cx: number; cy: number
} {
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2
  return {
    cx, cy,
    top:    { x: cx,                   y: shape.y               },
    bottom: { x: cx,                   y: shape.y + shape.height },
    left:   { x: shape.x,              y: cy                    },
    right:  { x: shape.x + shape.width, y: cy                   },
  }
}

/**
 * Genera segmentos ortogonales entre dos puntos cardinales.
 * startVertical: el punto de inicio sale en dirección vertical (Top/Bottom).
 * endVertical:   el punto de llegada entra en dirección vertical (Top/Bottom).
 *
 * Casos:
 *   H→H : Z-shape  horiz → vert → horiz  (midX = promedio de x)
 *   V→V : Z-shape  vert → horiz → vert   (midY = promedio de y)
 *   H→V : L-shape  {end.x, start.y} como codo
 *   V→H : L-shape  {start.x, end.y} como codo
 */
function buildCardinalPath(
  start: Point,
  end: Point,
  startVertical: boolean,
  endVertical: boolean,
): Point[] {
  const TOLERANCE = 2

  // Línea recta si ya están alineados en el eje de salida
  if (!startVertical && !endVertical && Math.abs(start.y - end.y) <= TOLERANCE) {
    return [start, end]
  }
  if (startVertical && endVertical && Math.abs(start.x - end.x) <= TOLERANCE) {
    return [start, end]
  }

  if (!startVertical && !endVertical) {
    // H → V → H  (Z-shape; cubre tanto flujo normal como bucle/U)
    const midX = Math.round((start.x + end.x) / 2)
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
  }

  if (startVertical && endVertical) {
    // V → H → V
    const midY = Math.round((start.y + end.y) / 2)
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
  }

  if (!startVertical && endVertical) {
    // H → V  (L-shape)
    return [start, { x: end.x, y: start.y }, end]
  }

  // V → H  (L-shape)
  return [start, { x: start.x, y: end.y }, end]
}

// ── Gateway tip routing (conservado del layouter anterior) ────────────────────

function isGateway(element: AnyShape): boolean {
  const bo = element?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

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
      ? { x: gateway.x + gateway.width, y: cy }
      : { x: gateway.x, y: cy }
  } else {
    return dy >= 0
      ? { x: cx, y: gateway.y + gateway.height }
      : { x: cx, y: gateway.y }
  }
}

function tipIsVertical(tip: Point, gateway: AnyShape): boolean {
  const cx = gateway.x + gateway.width / 2
  return Math.abs(tip.x - cx) < 2
}

function buildGatewayPath(
  start: Point,
  end: Point,
  srcExitsVertically: boolean,
  tgtEntersVertically: boolean,
): Point[] {
  return buildCardinalPath(start, end, srcExitsVertically, tgtEntersVertically)
}

// ── Post-import normalizer ────────────────────────────────────────────────────

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
      commandStack.clear()
    }
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

  // Auto-conexión
  if (source === target) {
    return BpmnLayouter.prototype.layoutConnection.call(this, connection, hints)
  }

  // ── Gateway: routing por tip cardinal de diamante ─────────────────────────
  const srcIsGateway = isGateway(source)
  const tgtIsGateway = isGateway(target)

  if (srcIsGateway || tgtIsGateway) {
    const srcTip: Point = srcIsGateway ? getGatewayTip(source, target) : { x: source.x + source.width / 2, y: source.y + source.height / 2 }
    const tgtTip: Point = tgtIsGateway ? getGatewayTip(target, source) : { x: target.x + target.width / 2, y: target.y + target.height / 2 }

    let srcExitsVertically: boolean
    let tgtEntersVertically: boolean

    if (srcIsGateway) {
      srcExitsVertically = tipIsVertical(srcTip, source)
    } else {
      srcExitsVertically = !tipIsVertical(tgtTip, target)
    }

    if (tgtIsGateway) {
      tgtEntersVertically = tipIsVertical(tgtTip, target)
    } else {
      tgtEntersVertically = !srcExitsVertically
    }

    return withoutRedundantPoints(
      buildGatewayPath(srcTip, tgtTip, srcExitsVertically, tgtEntersVertically)
    )
  }

  // ── Anclaje Cardinal Discreto (shape normal → shape normal) ───────────────
  const src = cardinals(source)
  const tgt = cardinals(target)
  const dx = tgt.cx - src.cx
  const dy = tgt.cy - src.cy

  let start: Point
  let end: Point
  let startVertical: boolean
  let endVertical: boolean

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Flujo horizontal
    if (dx >= 0) {
      // Destino a la derecha: sale por Right del origen, entra por Left del destino
      start = src.right
      end   = tgt.left
    } else {
      // Destino a la izquierda (bucle/U): sale por Left del origen, entra por Right del destino
      start = src.left
      end   = tgt.right
    }
    startVertical = false
    endVertical   = false
  } else {
    // Flujo vertical
    if (dy >= 0) {
      // Destino abajo: sale por Bottom del origen, entra por Top del destino
      start = src.bottom
      end   = tgt.top
    } else {
      // Destino arriba: sale por Top del origen, entra por Bottom del destino
      start = src.top
      end   = tgt.bottom
    }
    startVertical = true
    endVertical   = true
  }

  return withoutRedundantPoints(
    buildCardinalPath(start, end, startVertical, endVertical)
  )
}

export default {
  __init__: ['connectionImportNormalizer'],
  layouter: ['type', StrictOrthogonalLayouter],
  connectionImportNormalizer: ['type', ConnectionImportNormalizer],
}
