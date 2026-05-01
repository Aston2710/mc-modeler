type Point = { x: number; y: number }

// ── QuadTree ──────────────────────────────────────────────────────────────────

interface QBounds { x: number; y: number; width: number; height: number }
interface QItem extends QBounds { id: string }

class QuadTree {
  private bounds: QBounds
  private maxDepth: number
  private maxItems: number
  private depth: number
  private items: QItem[]
  private children: QuadTree[] | null

  constructor(bounds: QBounds, maxDepth = 6, maxItems = 4, depth = 0) {
    this.bounds = bounds
    this.maxDepth = maxDepth
    this.maxItems = maxItems
    this.depth = depth
    this.items = []
    this.children = null
  }

  insert(item: QItem): void {
    if (!this.intersects(this.bounds, item)) return

    if (this.children !== null) {
      for (const child of this.children) child.insert(item)
      return
    }

    this.items.push(item)

    if (this.items.length >= this.maxItems && this.depth < this.maxDepth) {
      this.subdivide()
      const existing = this.items
      this.items = []
      for (const it of existing) {
        for (const child of this.children!) child.insert(it)
      }
    }
  }

  query(bounds: QBounds): QItem[] {
    if (!this.intersects(this.bounds, bounds)) return []

    const result: QItem[] = []
    const seen = new Set<string>()

    for (const item of this.items) {
      if (this.intersects(item, bounds) && !seen.has(item.id)) {
        seen.add(item.id)
        result.push(item)
      }
    }

    if (this.children !== null) {
      for (const child of this.children) {
        for (const item of child.query(bounds)) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            result.push(item)
          }
        }
      }
    }

    return result
  }

  private subdivide(): void {
    const { x, y, width, height } = this.bounds
    const hw = width / 2
    const hh = height / 2
    const d = this.depth + 1
    this.children = [
      new QuadTree({ x: x,      y: y,      width: hw, height: hh }, this.maxDepth, this.maxItems, d),
      new QuadTree({ x: x + hw, y: y,      width: hw, height: hh }, this.maxDepth, this.maxItems, d),
      new QuadTree({ x: x,      y: y + hh, width: hw, height: hh }, this.maxDepth, this.maxItems, d),
      new QuadTree({ x: x + hw, y: y + hh, width: hw, height: hh }, this.maxDepth, this.maxItems, d),
    ]
  }

  private intersects(a: QBounds, b: QBounds): boolean {
    return !(
      a.x + a.width  < b.x ||
      b.x + b.width  < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    )
  }

  clear(): void {
    this.items = []
    this.children = null
  }
}

// ── buildObstacleGrid ─────────────────────────────────────────────────────────

interface ObstacleGrid {
  qtree: QuadTree
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

function buildObstacleGrid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements: any[],
  srcId: string,
  tgtId: string,
  margin = 10
): ObstacleGrid {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  const PAD = 100
  // First pass: collect bounds to size the QuadTree
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obstacles: any[] = []
  for (const el of elements) {
    if (el.waypoints) continue
    if (el.id === srcId || el.id === tgtId) continue
    if (el.type === 'label') continue
    const t = el.businessObject?.$type
    if (t === 'bpmn:Participant' || t === 'bpmn:Lane') continue
    obstacles.push(el)

    const ix = el.x - margin
    const iy = el.y - margin
    const iw = el.width  + margin * 2
    const ih = el.height + margin * 2
    if (ix < minX)       minX = ix
    if (iy < minY)       minY = iy
    if (ix + iw > maxX)  maxX = ix + iw
    if (iy + ih > maxY)  maxY = iy + ih
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 2000; maxY = 2000 }

  const treeBounds: QBounds = {
    x: minX - PAD,
    y: minY - PAD,
    width:  maxX - minX + PAD * 2,
    height: maxY - minY + PAD * 2,
  }

  const qtree = new QuadTree(treeBounds)
  for (const el of obstacles) {
    qtree.insert({
      x:      el.x - margin,
      y:      el.y - margin,
      width:  el.width  + margin * 2,
      height: el.height + margin * 2,
      id:     el.id,
    })
  }

  console.log('obstacles inserted:', obstacles.map(o => ({
    id: o.id,
    type: o.businessObject?.$type,
    inflated: { x: o.x-margin, y: o.y-margin, w: o.width+margin*2, h: o.height+margin*2 }
  })))
  console.log('start:', JSON.stringify(start), 'end:', JSON.stringify(end))

  return { qtree, bounds: { minX, minY, maxX, maxY } }
}

// ── A* ────────────────────────────────────────────────────────────────────────

interface AStarNode {
  gx: number
  gy: number
  g: number
  h: number
  f: number
  parent: AStarNode | null
  dirFromParent: 'up' | 'down' | 'left' | 'right' | null
}

const GRID = 10
const BEND_PENALTY = 20
const MAX_ITER = 50000

const DIRS: { dx: number; dy: number; dir: 'up' | 'down' | 'left' | 'right' }[] = [
  { dx: 0,  dy: -1, dir: 'up'    },
  { dx: 0,  dy:  1, dir: 'down'  },
  { dx: -1, dy:  0, dir: 'left'  },
  { dx:  1, dy:  0, dir: 'right' },
]

function aStarRoute(
  start: Point,
  end: Point,
  qtree: QuadTree,
  canvasBounds: { minX: number; minY: number; maxX: number; maxY: number },
  gridSize = GRID
): Point[] | null {
  const sgx = Math.round(start.x / gridSize)
  const sgy = Math.round(start.y / gridSize)
  const egx = Math.round(end.x   / gridSize)
  const egy = Math.round(end.y   / gridSize)

  if (sgx === egx && sgy === egy) return [start, end]

  const manhattan = (gx: number, gy: number) =>
    (Math.abs(gx - egx) + Math.abs(gy - egy)) * gridSize

  const openList: AStarNode[] = []
  const closedSet = new Set<string>()
  const openMap   = new Map<string, AStarNode>()

  const startNode: AStarNode = {
    gx: sgx, gy: sgy, g: 0,
    h: manhattan(sgx, sgy),
    f: manhattan(sgx, sgy),
    parent: null, dirFromParent: null,
  }
  openList.push(startNode)
  openMap.set(`${sgx},${sgy}`, startNode)

  let iter = 0
  while (openList.length > 0 && iter < MAX_ITER) {
    iter++

    // Pop lowest f
    let bestIdx = 0
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[bestIdx].f) bestIdx = i
    }
    const node = openList[bestIdx]
    openList.splice(bestIdx, 1)
    openMap.delete(`${node.gx},${node.gy}`)

    const key = `${node.gx},${node.gy}`
    if (closedSet.has(key)) continue
    closedSet.add(key)

    if (node.gx === egx && node.gy === egy) {
      // Reconstruct
      const path: Point[] = []
      let cur: AStarNode | null = node
      while (cur) {
        path.unshift({ x: cur.gx * gridSize, y: cur.gy * gridSize })
        cur = cur.parent
      }
      return path
    }

    for (const { dx, dy, dir } of DIRS) {
      const nx = node.gx + dx
      const ny = node.gy + dy
      const nkey = `${nx},${ny}`
      if (closedSet.has(nkey)) continue

      // Obstacle check
      const gs = gridSize
      const blocked = qtree.query({ x: nx * gs - 1, y: ny * gs - 1, width: gs + 2, height: gs + 2 })
      if (blocked.length > 0) continue

      let gNew = node.g + gridSize
      if (node.dirFromParent !== null && dir !== node.dirFromParent) {
        gNew += BEND_PENALTY
      }
      const hNew = manhattan(nx, ny)
      const fNew = gNew + hNew

      const existing = openMap.get(nkey)
      if (existing && existing.f <= fNew) continue

      const neighbor: AStarNode = {
        gx: nx, gy: ny, g: gNew, h: hNew, f: fNew,
        parent: node, dirFromParent: dir,
      }

      if (existing) {
        const idx = openList.indexOf(existing)
        if (idx !== -1) openList.splice(idx, 1)
      }
      openList.push(neighbor)
      openMap.set(nkey, neighbor)
    }
  }

  return null
}

// ── smoothPath ────────────────────────────────────────────────────────────────

function smoothPath(points: Point[]): Point[] {
  if (points.length <= 2) return points
  const result: Point[] = [points[0]]

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const next = points[i + 1]

    const collinearH = prev.y === curr.y && curr.y === next.y
    const collinearV = prev.x === curr.x && curr.x === next.x

    if (!collinearH && !collinearV) {
      result.push(curr)
    }
  }

  result.push(points[points.length - 1])
  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

export function routeWithAStar(
  start: Point,
  end: Point,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements: any[],
  srcId: string,
  tgtId: string,
  gridSize = 10,
  margin = 10
): Point[] | null {
  const { qtree, bounds } = buildObstacleGrid(elements, srcId, tgtId, margin)
  const raw = aStarRoute(start, end, qtree, bounds, gridSize)
  if (!raw) return null

  const smoothed = smoothPath(raw)

  // Anclar primer y último punto a coordenadas exactas del puerto
  smoothed[0] = { x: start.x, y: start.y }
  smoothed[smoothed.length - 1] = { x: end.x, y: end.y }

  // Forzar ortogonalidad estricta en puntos intermedios
  for (let i = 1; i < smoothed.length - 1; i++) {
    const prev = smoothed[i - 1]
    const curr = smoothed[i]
    if (Math.abs(curr.x - prev.x) > Math.abs(curr.y - prev.y)) {
      curr.y = prev.y
    } else {
      curr.x = prev.x
    }
  }

  // Insertar codo si el último segmento sigue siendo diagonal
  const last = smoothed[smoothed.length - 1]
  const prev2 = smoothed[smoothed.length - 2]
  if (last.x !== prev2.x && last.y !== prev2.y) {
    const horizontal = Math.abs(last.x - prev2.x) > Math.abs(last.y - prev2.y)
    smoothed.splice(smoothed.length - 1, 0, {
      x: horizontal ? last.x : prev2.x,
      y: horizontal ? prev2.y : last.y,
    })
  }

  return smoothed
}
