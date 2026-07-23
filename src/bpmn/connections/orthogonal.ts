/**
 * orthogonal.ts — primitivas puras de geometría ortogonal para el routing.
 *
 * Sin dependencias de bpmn-js: operan sobre puntos/rects planos y son
 * unit-testables. Implementan:
 *  - invariante de ortogonalidad (isOrthogonal / firstDiagonalIndex)
 *  - reparación en cadena de extremos (repairChainFromStart/End): re-ancla un
 *    extremo sin romper la ortogonalidad del resto, insertando un bend cuando
 *    la cara cambió de eje en vez de sesgar el segmento vecino
 *  - dock deslizante (slideDock): generalización de freeEdgeDock de Groups a
 *    cualquier shape rectangular — el anclaje conserva su posición a lo largo
 *    de la arista (estilo Ports de Bizagi, findings §15)
 *  - dock de gateway (gatewayVertexDock): vértice del rombo con histéresis
 *    para evitar el flip instantáneo al cruzar el centro durante un drag
 */

export type Point = { x: number; y: number }
export type Face = 'top' | 'bottom' | 'left' | 'right'
export type RectLike = { x: number; y: number; width: number; height: number }
export type Dock = { x: number; y: number; face: Face }

export const DEFAULT_EDGE_MARGIN = 12
export const GATEWAY_FACE_HYSTERESIS = 15

const TOL = 1

function horizontalFace(face: Face): boolean {
  return face === 'left' || face === 'right'
}

/** true si todos los segmentos son horizontales o verticales (tolerancia `tol`). */
export function isOrthogonal(wps: readonly Point[] | null | undefined, tol = TOL): boolean {
  return firstDiagonalIndex(wps, tol) === -1
}

/** Índice `i` del primer segmento diagonal (entre wps[i-1] y wps[i]), o -1. */
export function firstDiagonalIndex(wps: readonly Point[] | null | undefined, tol = TOL): number {
  if (!wps || wps.length < 2) return -1
  for (let i = 1; i < wps.length; i++) {
    if (Math.abs(wps[i].x - wps[i - 1].x) > tol && Math.abs(wps[i].y - wps[i - 1].y) > tol) return i
  }
  return -1
}

/**
 * true si TODOS los segmentos están perfectamente alineados (0px) y con
 * coordenadas ENTERAS. Es la garantía que diagram-js exige para que un segmento
 * sea arrastrable (ALIGNED_THRESHOLD=2, pero exigimos exacto para no depender
 * de la tolerancia). Espejo de la garantía de Bizagi (los puntos SON la solución
 * ortogonal). Ver fix_doc/routing-orthogonal-invariant-and-shape-invasion.md §5d.
 */
export function isExactOrthogonal(wps: readonly Point[] | null | undefined): boolean {
  if (!wps || wps.length < 2) return true
  for (const p of wps) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return false
  }
  for (let i = 1; i < wps.length; i++) {
    if (wps[i].x !== wps[i - 1].x && wps[i].y !== wps[i - 1].y) return false
  }
  return true
}

/**
 * Snap a ortogonal EXACTA con coordenadas enteras: redondea todos los puntos y
 * alinea cada segmento al eje dominante (el delta menor se colapsa a 0),
 * propagando hacia adelante. La entrada ya viene "casi ortogonal" (≤tol del
 * invariante), así que esto solo elimina residuos sub-píxel y fracciones — no
 * reforma la ruta. Colapsa puntos degenerados al final.
 *
 * Garantiza: `isExactOrthogonal(snapOrthogonal(wps)) === true` (mientras la
 * entrada sea ya casi-ortogonal, ≤ tol). Devuelve un array nuevo.
 */
export function snapOrthogonal(wps: readonly Point[] | null | undefined, tol = TOL): Point[] {
  if (!wps || wps.length < 2) return wps ? wps.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) : []
  const out = wps.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))
  // Alinear cada segmento propagando hacia adelante: el primer punto es ancla;
  // para cada siguiente, si el segmento es casi-horizontal o casi-vertical,
  // forzar la coordenada compartida al valor del punto previo (0px exacto).
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i]
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y)
    if (dx === 0 || dy === 0) continue // ya alineado
    // dentro de tolerancia en un eje → colapsar ese eje al del ancla
    if (dx <= tol && dy > tol) b.x = a.x        // casi-vertical → misma x
    else if (dy <= tol && dx > tol) b.y = a.y   // casi-horizontal → misma y
    else if (dx <= dy) b.x = a.x                // diagonal residual: colapsa el eje menor
    else b.y = a.y
  }
  return collapseColinear(out, 0)
}

/** Elimina puntos colineales y duplicados. Devuelve un array nuevo. */
export function collapseColinear(wps: readonly Point[], tol = TOL): Point[] {
  const out = wps.map(p => ({ x: p.x, y: p.y }))
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i], c = out[i + 1]
    const dup = Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol
    const colinear =
      (Math.abs(a.x - b.x) <= tol && Math.abs(b.x - c.x) <= tol) ||
      (Math.abs(a.y - b.y) <= tol && Math.abs(b.y - c.y) <= tol)
    if (dup || colinear) {
      out.splice(i, 1)
      i -= 1
    }
  }
  // duplicado en el penúltimo (no cubierto por el bucle cuando colapsa al final)
  if (out.length >= 2) {
    const a = out[out.length - 2], b = out[out.length - 1]
    if (Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && out.length > 2) out.splice(out.length - 2, 1)
  }
  return out
}

/**
 * Re-ancla el PRIMER waypoint en `dock` manteniendo ortogonalidad.
 * `face` es la cara del shape source por la que sale la conexión: left/right
 * exigen primer segmento horizontal; top/bottom, vertical.
 * Si el vecino no puede deslizarse sin romper su propio segmento, inserta un bend.
 * Devuelve un array nuevo (no muta la entrada).
 */
export function repairChainFromStart(wps: readonly Point[], dock: Point, face: Face, tol = TOL): Point[] {
  if (!wps || wps.length < 2) return wps ? wps.map(p => ({ ...p })) : []
  const out = wps.map(p => ({ x: p.x, y: p.y }))
  out[0] = { x: dock.x, y: dock.y }
  const wantHorizontal = horizontalFace(face)
  const p1 = out[1]

  if (wantHorizontal) {
    if (Math.abs(p1.y - dock.y) > tol) {
      const p2 = out[2]
      if (p2 && Math.abs(p1.x - p2.x) <= tol) {
        // p1–p2 es vertical → p1 puede deslizarse a la altura del dock
        out[1] = { x: p1.x, y: dock.y }
      } else {
        // insertar bend: dock →(H)→ bend →(V)→ p1
        out.splice(1, 0, { x: p1.x, y: dock.y })
      }
    }
  } else {
    if (Math.abs(p1.x - dock.x) > tol) {
      const p2 = out[2]
      if (p2 && Math.abs(p1.y - p2.y) <= tol) {
        // p1–p2 es horizontal → p1 puede deslizarse a la vertical del dock
        out[1] = { x: dock.x, y: p1.y }
      } else {
        // insertar bend: dock →(V)→ bend →(H)→ p1
        out.splice(1, 0, { x: dock.x, y: p1.y })
      }
    }
  }
  return collapseColinear(out, tol)
}

/** Simétrico de repairChainFromStart para el ÚLTIMO waypoint (cara del target). */
export function repairChainFromEnd(wps: readonly Point[], dock: Point, face: Face, tol = TOL): Point[] {
  const reversed = [...wps].reverse()
  return repairChainFromStart(reversed, dock, face, tol).reverse()
}

/**
 * Dock deslizante sobre la arista de un shape rectangular: conserva la posición
 * de `adjacent` a lo largo del borde (no fuerza al centro), clampada con margen.
 * La cara se elige por el mayor overflow de `adjacent` respecto al rect
 * (misma lógica que freeEdgeDock de Groups; da histéresis natural).
 */
export function slideDock(shape: RectLike, adjacent: Point, margin = DEFAULT_EDGE_MARGIN): Dock {
  const left = shape.x
  const right = shape.x + shape.width
  const top = shape.y
  const bottom = shape.y + shape.height
  // margen adaptativo: shapes pequeños (events 36px) no degeneran
  const m = Math.min(margin, shape.width / 4, shape.height / 4)

  const over: [Face, number][] = [
    ['right', adjacent.x - right],
    ['left', left - adjacent.x],
    ['bottom', adjacent.y - bottom],
    ['top', top - adjacent.y],
  ]
  const face = over.reduce((best, e) => (e[1] > best[1] ? e : best))[0]

  const clampX = (x: number) => Math.min(right - m, Math.max(left + m, x))
  const clampY = (y: number) => Math.min(bottom - m, Math.max(top + m, y))

  if (face === 'left') return { x: left, y: clampY(adjacent.y), face }
  if (face === 'right') return { x: right, y: clampY(adjacent.y), face }
  if (face === 'top') return { x: clampX(adjacent.x), y: top, face }
  return { x: clampX(adjacent.x), y: bottom, face }
}

/** Vértice cardinal del rombo de un gateway para una cara dada. */
export function gatewayVertex(gw: RectLike, face: Face): Point {
  const gcx = gw.x + gw.width / 2
  const gcy = gw.y + gw.height / 2
  switch (face) {
    case 'top': return { x: gcx, y: gw.y }
    case 'bottom': return { x: gcx, y: gw.y + gw.height }
    case 'left': return { x: gw.x, y: gcy }
    case 'right': return { x: gw.x + gw.width, y: gcy }
  }
}

/**
 * Dock de gateway: vértice del rombo de la cara elegida por overflow, con
 * histéresis — si `currentFace` viene, solo cambia de cara cuando el overflow
 * de la nueva supera al de la actual por más de `hysteresis` px.
 */
export function gatewayVertexDock(
  gw: RectLike,
  adjacent: Point,
  currentFace?: Face,
  hysteresis = GATEWAY_FACE_HYSTERESIS,
): Dock {
  const left = gw.x
  const right = gw.x + gw.width
  const top = gw.y
  const bottom = gw.y + gw.height
  const over: Record<Face, number> = {
    right: adjacent.x - right,
    left: left - adjacent.x,
    bottom: adjacent.y - bottom,
    top: top - adjacent.y,
  }
  let face = (Object.entries(over) as [Face, number][])
    .reduce((best, e) => (e[1] > best[1] ? e : best))[0]
  if (currentFace && face !== currentFace && over[face] - over[currentFace] <= hysteresis) {
    face = currentFace
  }
  const v = gatewayVertex(gw, face)
  return { x: v.x, y: v.y, face }
}

export type DockKind = 'rect' | 'gateway'

/** Dispatcher: rect → dock deslizante; gateway → vértice con histéresis. */
export function dockPoint(
  shape: RectLike,
  adjacent: Point,
  kind: DockKind,
  currentFace?: Face,
  margin = DEFAULT_EDGE_MARGIN,
): Dock {
  return kind === 'gateway'
    ? gatewayVertexDock(shape, adjacent, currentFace)
    : slideDock(shape, adjacent, margin)
}

/** true si `p` cae en el INTERIOR estricto del rect (no en el borde). */
export function pointInRectInterior(shape: RectLike, p: Point, tol = 1): boolean {
  return p.x > shape.x + tol && p.x < shape.x + shape.width - tol &&
         p.y > shape.y + tol && p.y < shape.y + shape.height - tol
}

/**
 * true si un segmento ORTOGONAL (p1→p2) atraviesa el interior del rect.
 *
 * Usa solape de intervalos, NO cruce de extremos: detecta tanto el traversal
 * completo (entra por un lado y sale por el otro) como el caso "entra y termina
 * dentro" — el punto ciego que producía la flecha metida en el shape. Un
 * segmento que corre por el borde o por fuera NO clipea (interior estricto),
 * así que el segmento de dock que toca la arista no dispara falso positivo.
 */
export function segmentClipsRect(p1: Point, p2: Point, shape: RectLike, tol = 1): boolean {
  const left = shape.x + tol, right = shape.x + shape.width - tol
  const top = shape.y + tol, bottom = shape.y + shape.height - tol
  if (right <= left || bottom <= top) return false
  const horizontal = Math.abs(p1.y - p2.y) <= tol
  const vertical = Math.abs(p1.x - p2.x) <= tol
  if (horizontal) {
    const y = (p1.y + p2.y) / 2
    if (y <= top || y >= bottom) return false
    const lo = Math.min(p1.x, p2.x), hi = Math.max(p1.x, p2.x)
    return hi > left && lo < right
  }
  if (vertical) {
    const x = (p1.x + p2.x) / 2
    if (x <= left || x >= right) return false
    const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y)
    return hi > top && lo < bottom
  }
  return false  // diagonal: fuera del alcance de esta primitiva (lo cubre isOrthogonal)
}

/**
 * true si la ruta INVADE el rect: algún waypoint en el interior estricto, o
 * algún segmento que clipea el interior. Uniforme para src, tgt y obstáculos —
 * el dock legítimo toca el BORDE (no el interior) y por eso no dispara.
 *
 * Este es el predicado que faltaba: todas las capas previas de validación solo
 * buscaban "atraviesa de lado a lado"; ninguna detectaba "entra y muere dentro".
 */
export function routeInvades(wps: readonly Point[] | null | undefined, shape: RectLike, tol = 1): boolean {
  if (!wps || wps.length < 2) return false
  for (const p of wps) if (pointInRectInterior(shape, p, tol)) return true
  for (let i = 1; i < wps.length; i++) if (segmentClipsRect(wps[i - 1], wps[i], shape, tol)) return true
  return false
}

/** true si el punto está sobre el perímetro del rect (tolerancia `tol`). */
export function isOnRectEdge(shape: RectLike, p: Point, tol = 1.5): boolean {
  const left = shape.x
  const right = shape.x + shape.width
  const top = shape.y
  const bottom = shape.y + shape.height
  const withinX = p.x >= left - tol && p.x <= right + tol
  const withinY = p.y >= top - tol && p.y <= bottom + tol
  const onV = (Math.abs(p.x - left) <= tol || Math.abs(p.x - right) <= tol) && withinY
  const onH = (Math.abs(p.y - top) <= tol || Math.abs(p.y - bottom) <= tol) && withinX
  return onV || onH
}
