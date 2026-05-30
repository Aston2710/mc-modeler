/**
 * groupDocking.ts — anclaje LIBRE de flechas sobre las aristas de un Grupo.
 *
 * Por defecto el routing/segment-drag fuerza el punto de anclaje al CENTRO de
 * cada arista (los 4 cardinales). Para los Grupos eso es muy limitante: el
 * usuario quiere posicionar libremente de dónde sale/entra la flecha a lo largo
 * del borde (estilo Bizagi). Estos helpers proyectan el anclaje sobre la arista
 * conservando la posición a lo largo de ella, con un margen para no pegarse a
 * las esquinas.
 *
 * Se aplica SOLO a Grupos para no alterar el auto-routing de los flujos normales.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any
type Point = { x: number; y: number }
export type Face = 'top' | 'bottom' | 'left' | 'right'

export const GROUP_EDGE_MARGIN = 12

export function isGroupShape(s: AnyObj): boolean {
  const bo = s?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Group'))
}

/**
 * Proyecta un punto de anclaje LIBRE sobre la arista del shape determinada por
 * la posición del punto `adjacent` (el waypoint vecino o el cursor). Mantiene la
 * posición a lo largo de la arista (no la fuerza al centro), clampada al alto/
 * ancho del shape con `margin`.
 */
export function freeEdgeDock(
  shape: AnyObj,
  adjacent: Point,
  margin = GROUP_EDGE_MARGIN,
): { x: number; y: number; face: Face } {
  const left = shape.x
  const right = shape.x + shape.width
  const top = shape.y
  const bottom = shape.y + shape.height

  // Overflow de `adjacent` respecto a cada cara: el mayor positivo indica por
  // qué lado cruza la conexión. Si `adjacent` está dentro del shape (todos
  // negativos), el "menos negativo" es la cara más cercana.
  const over: [Face, number][] = [
    ['right', adjacent.x - right],
    ['left', left - adjacent.x],
    ['bottom', adjacent.y - bottom],
    ['top', top - adjacent.y],
  ]
  const chosen: Face = over.reduce((bestEntry, entry) =>
    entry[1] > bestEntry[1] ? entry : bestEntry
  )[0]

  const clampX = (x: number) => Math.min(right - margin, Math.max(left + margin, x))
  const clampY = (y: number) => Math.min(bottom - margin, Math.max(top + margin, y))

  if (chosen === 'left')   return { x: left,  y: clampY(adjacent.y), face: chosen }
  if (chosen === 'bottom') return { x: clampX(adjacent.x), y: bottom, face: chosen }
  if (chosen === 'top')    return { x: clampX(adjacent.x), y: top,    face: chosen }
  return { x: right, y: clampY(adjacent.y), face: 'right' }
}
