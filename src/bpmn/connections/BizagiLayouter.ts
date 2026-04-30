/**
 * BizagiLayouter — Híbrido: cardinals estrictos + Manhattan nativo.
 *
 * Responsabilidad de este módulo:
 *   1. Elegir el punto cardinal exacto (centro de cara) de salida y entrada,
 *      respetando hints de arrastre del usuario y tips de gateway.
 *   2. Aplicar port offset si otra conexión ya usa la misma cara cardinal.
 *   3. Delegar el path completo a connectRectangles (Manhattan nativo),
 *      que esquiva obstáculos y genera U-turns sin cruzar por dentro de shapes.
 *
 * BizagiConnectionDocking garantiza que esos cardinals no se deslicen
 * hacia las esquinas tras el recorte nativo.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { connectRectangles } from 'diagram-js/lib/layout/ManhattanLayout'

type Point = { x: number; y: number }
type Face = 'top' | 'bottom' | 'left' | 'right'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any

const PORT_OFFSET = 15

// ── Shape helpers ─────────────────────────────────────────────────────────────

function scx(s: Shape): number { return s.x + s.width / 2 }
function scy(s: Shape): number { return s.y + s.height / 2 }

function isGateway(el: Shape): boolean {
  const bo = el?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

// ── Cardinal points ───────────────────────────────────────────────────────────

function faceCardinal(s: Shape, face: Face): Point {
  switch (face) {
    case 'top':    return { x: scx(s), y: s.y }
    case 'bottom': return { x: scx(s), y: s.y + s.height }
    case 'left':   return { x: s.x,           y: scy(s) }
    case 'right':  return { x: s.x + s.width, y: scy(s) }
  }
}

function isHoriz(face: Face): boolean {
  return face === 'left' || face === 'right'
}

// ── Face selection ────────────────────────────────────────────────────────────

function nearestFace(s: Shape, p: Point): Face {
  const candidates: [Face, number][] = [
    ['top',    Math.hypot(p.x - scx(s), p.y - s.y)],
    ['bottom', Math.hypot(p.x - scx(s), p.y - (s.y + s.height))],
    ['left',   Math.hypot(p.x - s.x,           p.y - scy(s))],
    ['right',  Math.hypot(p.x - (s.x + s.width), p.y - scy(s))],
  ]
  return candidates.sort((a, b) => a[1] - b[1])[0][0]
}

function gatewayFace(gw: Shape, other: Shape): Face {
  const dx = scx(other) - scx(gw)
  const dy = scy(other) - scy(gw)
  const dxN = Math.abs(dx) / (gw.width / 2)
  const dyN = Math.abs(dy) / (gw.height / 2)
  if (dxN >= dyN) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function defaultFace(src: Shape, tgt: Shape): Face {
  const dx = scx(tgt) - scx(src)
  const dy = scy(tgt) - scy(src)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function pickFace(shape: Shape, other: Shape, hint?: Point): Face {
  if (hint) return nearestFace(shape, hint)
  if (isGateway(shape)) return gatewayFace(shape, other)
  return defaultFace(shape, other)
}

// ── Diagonal detector (for import normalizer) ─────────────────────────────────

function hasDiagonals(wps: Point[] | null | undefined): boolean {
  if (!wps || wps.length < 2) return false
  for (let i = 1; i < wps.length; i++) {
    if (Math.abs(wps[i].x - wps[i - 1].x) > 2 && Math.abs(wps[i].y - wps[i - 1].y) > 2) return true
  }
  return false
}

// ── BizagiLayouter ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiLayouter(this: any) {}
BizagiLayouter.$inject = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.layoutConnection = function (connection: any, hints: any) {
  hints = hints || {}
  const src: Shape = hints.source || connection.source
  const tgt: Shape = hints.target || connection.target

  if (!src?.width || !src?.height || !tgt?.width || !tgt?.height) return connection.waypoints || []
  if (src === tgt) return connection.waypoints || []

  const sFace = pickFace(src, tgt, hints.connectionStart)
  const tFace = pickFace(tgt, src, hints.connectionEnd)

  let start = faceCardinal(src, sFace)
  const end   = faceCardinal(tgt, tFace)

  // Port offset: stagger connections sharing the same exit face
  let sameCount = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const conn of (src.outgoing || []) as any[]) {
    if (conn === connection || !conn.waypoints?.length) continue
    if (nearestFace(src, conn.waypoints[0]) === sFace) sameCount++
  }
  if (sameCount > 0) {
    const off = sameCount * PORT_OFFSET
    start = isHoriz(sFace)
      ? { x: start.x, y: start.y + off }
      : { x: start.x + off, y: start.y }
  }

  // Manhattan engine handles obstacle avoidance and U-turns
  return connectRectangles(src, tgt, start, end, hints)
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
