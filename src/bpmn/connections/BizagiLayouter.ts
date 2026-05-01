/**
 * BizagiLayouter — Híbrido: cardinals estrictos + Manhattan nativo.
 *
 * Responsabilidad:
 *   1. Elegir el cardinal exacto (centro de cara) de salida y entrada,
 *      respetando hints de arrastre y tips de gateway.
 *   2. Aplicar port offset si otra conexión ya usa la misma cara.
 *   3. Pasar `hints.preferredLayouts = ['r:l']` (notación t|r|b|l) para que
 *      connectRectangles genere stubs perpendiculares desde la cara correcta
 *      sin adivinar por la geometría relativa de las cajas.
 *
 * BizagiConnectionDocking impide que el recorte nativo deslice esos puntos
 * cardinales hacia las esquinas tras el rendering.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { connectPoints } from 'diagram-js/lib/layout/ManhattanLayout'

type Point = { x: number; y: number }
type Face = 'top' | 'bottom' | 'left' | 'right'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any

const PORT_OFFSET = 15

// ManhattanLayout direction letters (must match /t|r|b|l/ regex in ManhattanLayout.js)
const FACE_DIR: Record<Face, string> = { top: 't', right: 'r', bottom: 'b', left: 'l' }

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
    ['left',   Math.hypot(p.x - s.x,             p.y - scy(s))],
    ['right',  Math.hypot(p.x - (s.x + s.width), p.y - scy(s))],
  ]
  return candidates.sort((a, b) => a[1] - b[1])[0][0]
}

function gatewayFace(gw: Shape, other: Shape): Face {
  const dx = scx(other) - scx(gw)
  const dy = scy(other) - scy(gw)
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  if (absDx > absDy * 1.5) return dx >= 0 ? 'right' : 'left'
  if (absDy > absDx * 1.5) return dy >= 0 ? 'bottom' : 'top'
  return dy >= 0 ? 'bottom' : 'top'
}

function defaultFace(src: Shape, tgt: Shape): Face {
  const dx = scx(tgt) - scx(src)
  const dy = scy(tgt) - scy(src)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function isShapeCenter(shape: Shape, p: Point): boolean {
  return Math.abs(p.x - scx(shape)) < 1 && Math.abs(p.y - scy(shape)) < 1
}

function pickFace(shape: Shape, other: Shape, hint?: Point, isShapeMove?: boolean): Face {
  if (!isShapeMove && hint && typeof hint === 'object' && !isShapeCenter(shape, hint)) {
    return nearestFace(shape, hint)
  }
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

  const shapeMoveMode = hints.connectionStart === false
  const sFace = pickFace(src, tgt, shapeMoveMode ? undefined : hints.connectionStart, shapeMoveMode)
  const tFace = pickFace(tgt, src, shapeMoveMode ? undefined : hints.connectionEnd, shapeMoveMode)

  let start = faceCardinal(src, sFace)
  let end   = faceCardinal(tgt, tFace)

  // Port offset: stagger connections sharing the same exit face on source
  let sameOutCount = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const conn of (src.outgoing || []) as any[]) {
    if (conn === connection || !conn.waypoints?.length) continue
    if (nearestFace(src, conn.waypoints[0]) === sFace) sameOutCount++
  }
  if (sameOutCount > 0) {
    const off = sameOutCount * PORT_OFFSET
    // getDockingPoint inside connectRectangles preserves the non-primary axis:
    // for 'r'/'l' it keeps y; for 't'/'b' it keeps x — offset goes there.
    start = isHoriz(sFace)
      ? { x: start.x, y: start.y + off }
      : { x: start.x + off, y: start.y }
  }

  // Port offset: stagger connections sharing the same entry face on target
  let sameInCount = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const conn of (tgt.incoming || []) as any[]) {
    if (conn === connection || !conn.waypoints?.length) continue
    const lastWp = conn.waypoints[conn.waypoints.length - 1]
    if (nearestFace(tgt, lastWp) === tFace) sameInCount++
  }
  if (sameInCount > 0) {
    const off = sameInCount * PORT_OFFSET
    end = isHoriz(tFace)
      ? { x: end.x, y: end.y + off }
      : { x: end.x + off, y: end.y }
  }

  // Force exact exit/entry faces via explicit trbl direction string.
  // isExplicitDirections() in ManhattanLayout checks /t|r|b|l/ and bypasses
  // the orientation-based direction guess, so Manhattan honours our cardinals.
  const direction = `${FACE_DIR[sFace]}:${FACE_DIR[tFace]}`
  return connectPoints(start, end, direction)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.repairConnection = function (connection: any, newEnd: any, hints: any) {
  hints = hints || {}
  return this.layoutConnection(connection, hints)
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
