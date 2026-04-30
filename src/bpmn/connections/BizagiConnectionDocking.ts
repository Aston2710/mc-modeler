type Point = { x: number; y: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any

function centerOf(shape: Shape): Point {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiConnectionDocking(this: any) {}
BizagiConnectionDocking.$inject = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiConnectionDocking.prototype.getCroppedWaypoints = function (connection: any): Point[] {
  return connection.waypoints || []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiConnectionDocking.prototype.getDockingPoint = function (connection: any, shape: Shape, dockStart: boolean) {
  const wps: Point[] = connection.waypoints || []
  if (wps.length < 2) {
    const c = centerOf(shape)
    return { x: c.x, y: c.y, actual: c }
  }
  const p = dockStart ? wps[0] : wps[wps.length - 1]
  return { x: p.x, y: p.y, actual: { x: p.x, y: p.y } }
}

export default {
  connectionDocking: ['type', BizagiConnectionDocking],
}
