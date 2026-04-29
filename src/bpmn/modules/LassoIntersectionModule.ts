// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const MARKER_SELECTED = 'selected'

function elementBBox(element: AnyObj) {
  if (element.waypoints && element.waypoints.length > 0) {
    const xs: number[] = element.waypoints.map((p: AnyObj) => p.x)
    const ys: number[] = element.waypoints.map((p: AnyObj) => p.y)
    const x = Math.min(...xs), y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }
  if (typeof element.x === 'number') {
    return { x: element.x, y: element.y, width: element.width || 0, height: element.height || 0 }
  }
  return null
}

function isContainer(element: AnyObj): boolean {
  if (element.children && element.children.length > 0) return true
  const bo = element.businessObject
  if (!bo) return false
  // Also catches empty pools, lanes, and sub-processes
  return !!(bo.$instanceOf?.('bpmn:Participant') || bo.$instanceOf?.('bpmn:Lane') || bo.$instanceOf?.('bpmn:SubProcess'))
}

function shouldSelect(element: AnyObj, bbox: AnyObj): boolean {
  if (element.waypoints) return false  // connections follow their shapes; no need to select

  const eb = elementBBox(element)
  if (!eb) return false

  if (isContainer(element)) {
    // Containers only selected when fully inside lasso — prevents pool being
    // selected when lasso starts from inside it
    return (
      eb.x >= bbox.x &&
      eb.y >= bbox.y &&
      eb.x + eb.width  <= bbox.x + bbox.width &&
      eb.y + eb.height <= bbox.y + bbox.height
    )
  }

  // Leaf shapes and connections: intersection (touch-to-select like Bizagi)
  return (
    eb.x < bbox.x + bbox.width  &&
    eb.x + eb.width  > bbox.x   &&
    eb.y < bbox.y + bbox.height &&
    eb.y + eb.height > bbox.y
  )
}

function LassoIntersection(eventBus: AnyObj, elementRegistry: AnyObj, canvas: AnyObj) {
  // Track which elements were given intersection markers (separate from context.marked)
  let prevIntersection: Set<AnyObj> = new Set()

  function resetState() {
    prevIntersection = new Set()
  }

  // ── Visual preview ────────────────────────────────────────────────────────
  // Runs AFTER original lasso.move (priority 1000). Does NOT touch context.marked —
  // only adds/removes the CSS 'selected' marker for intersection preview.
  eventBus.on('lasso.move', 500, function (event: AnyObj) {
    const { context } = event
    const { bbox, marked: containmentMarked } = context
    if (!bbox) return

    const allElements: AnyObj[] = elementRegistry.getAll()
    const newIntersection = new Set(allElements.filter((el: AnyObj) => shouldSelect(el, bbox)))

    // Strip 'selected' from connections the original handler may have added
    for (const e of (containmentMarked as Set<AnyObj>)) {
      if (e.waypoints) canvas.removeMarker(e, MARKER_SELECTED)
    }

    // Add marker for elements newly intersecting but not already in containment set
    for (const e of newIntersection) {
      if (!containmentMarked.has(e)) canvas.addMarker(e, MARKER_SELECTED)
    }
    // Remove marker for elements that left intersection and aren't in containment set
    for (const e of prevIntersection) {
      if (!newIntersection.has(e) && !containmentMarked.has(e)) canvas.removeMarker(e, MARKER_SELECTED)
    }

    prevIntersection = newIntersection
  })

  // ── Final selection ───────────────────────────────────────────────────────
  // Runs BEFORE original lasso.end (priority 0). Sets context.marked to the
  // intersection result so the original handler calls selection.select() correctly.
  eventBus.on('lasso.end', 1, function (event: AnyObj) {
    const { context } = event
    const { bbox, initialMarked } = context
    if (!bbox || !initialMarked) return

    const allElements: AnyObj[] = elementRegistry.getAll()
    const intersecting = new Set(allElements.filter((el: AnyObj) => shouldSelect(el, bbox)))
    context.marked = initialMarked.union(intersecting)
  })

  eventBus.on('lasso.start', resetState)

  eventBus.on('lasso.cleanup', function () {
    // Remove any residual 'selected' markers from connections — lasso.cleanup
    // diffs context.marked (no connections) so the original visuals.update never
    // clears markers that the original lasso.move handler put on connections.
    for (const el of (elementRegistry.getAll() as AnyObj[])) {
      if (el.waypoints) canvas.removeMarker(el, MARKER_SELECTED)
    }
    resetState()
  })
}

LassoIntersection.$inject = ['eventBus', 'elementRegistry', 'canvas']

const LassoIntersectionModule = {
  __init__: ['lassoIntersection'],
  lassoIntersection: ['type', LassoIntersection],
}

export default LassoIntersectionModule
