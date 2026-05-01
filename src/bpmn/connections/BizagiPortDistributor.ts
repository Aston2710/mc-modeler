type Point = { x: number; y: number }
type Face = 'top' | 'bottom' | 'left' | 'right'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any

export function getPortPoint(shape: Shape, face: Face, index: number, total: number): Point {
  const step = 1 / (total + 1)
  const percent = step * (index + 1)

  switch (face) {
    case 'top':
      return { x: shape.x + shape.width * percent, y: shape.y - 1 }
    case 'bottom':
      return { x: shape.x + shape.width * percent, y: shape.y + shape.height + 1 }
    case 'left':
      return { x: shape.x - 1, y: shape.y + shape.height * percent }
    case 'right':
      return { x: shape.x + shape.width + 1, y: shape.y + shape.height * percent }
  }
}

export function snapToNearestSlot(shape: Shape, face: Face, point: Point, total: number): Point {
  let best: Point | null = null
  let bestDist = Infinity

  for (let i = 0; i < total; i++) {
    const slot = getPortPoint(shape, face, i, total)
    const dist = Math.hypot(slot.x - point.x, slot.y - point.y)
    if (dist < bestDist) {
      bestDist = dist
      best = slot
    }
  }

  return best ?? point
}
