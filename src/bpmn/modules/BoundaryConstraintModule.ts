// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — diagram-js ships CommonJS without full types
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// Estricto límite en el origen del canvas (0, 0)
const CANVAS_MARGIN = 0

// ── helpers ─────────────────────────────────────────────────────────────────

function isRoot(element: AnyObj): boolean {
  return !element || element.type === '__implicitroot'
}

function isContainer(element: AnyObj): boolean {
  const bo = element?.businessObject
  if (!bo?.$instanceOf) return false
  return (
    bo.$instanceOf('bpmn:Lane') ||
    bo.$instanceOf('bpmn:Participant') ||
    bo.$instanceOf('bpmn:SubProcess')
  )
}

// ── BoundaryRules — prevent dropping pool elements on canvas root ─────────

function BoundaryRules(eventBus: AnyObj) {
  RuleProvider.call(this, eventBus)
}

inherits(BoundaryRules, RuleProvider)
BoundaryRules.$inject = ['eventBus']

BoundaryRules.prototype.init = function () {
  // Priority 1500 — fires before BpmnRules (1000) so we have final say.
  this.addRule('elements.move', 1500, function (context: AnyObj) {
    const { shapes, target } = context
    // null target = keyboard move or drag start before hover is resolved —
    // moving within current container. Let BpmnRules (1000) decide.
    if (target == null) return undefined
    if (isRoot(target)) {
      for (const shape of (shapes ?? [])) {
        if (isContainer(shape.parent)) return false
      }
    }
    return undefined
  })
}

// ── BoundaryConstraint — clamp event.dx/dy before preview renders ────────

function BoundaryConstraint(eventBus: AnyObj) {
  // Priority 1500 — fires before MovePreview (499) and Move.js (250)
  eventBus.on('shape.move.move', 1500, function (event: AnyObj) {
    const shapes: AnyObj[] = event.context?.shapes ?? []
    if (!shapes.length) return

    let minDx = -Infinity
    let minDy = -Infinity

    for (const s of shapes) {
      if (typeof s.x !== 'number') continue
      minDx = Math.max(minDx, CANVAS_MARGIN - s.x)
      minDy = Math.max(minDy, CANVAS_MARGIN - s.y)
    }

    const applyClampX = (clampedDx: number) => {
      const diff = clampedDx - event.dx;
      if (diff !== 0) {
        event.dx = clampedDx;
        // Compensamos event.x para que el ratón no se desincronice
        event.x += diff;
      }
    };
    
    const applyClampY = (clampedDy: number) => {
      const diff = clampedDy - event.dy;
      if (diff !== 0) {
        event.dy = clampedDy;
        // Compensamos event.y para que el ratón no se desincronice
        event.y += diff;
      }
    };

    if (isFinite(minDx)) applyClampX(Math.max(event.dx, minDx));
    if (isFinite(minDy)) applyClampY(Math.max(event.dy, minDy));
  })

  // Clamp palette-drop creation
  function clampCreateEvent(event: AnyObj) {
    const shape = event.context?.shape || event.context?.elements?.[0]
    if (!shape) return
    const halfW = (shape.width ?? 0) / 2
    const halfH = (shape.height ?? 0) / 2
    if (event.x - halfW < CANVAS_MARGIN) event.x = CANVAS_MARGIN + halfW
    if (event.y - halfH < CANVAS_MARGIN) event.y = CANVAS_MARGIN + halfH
  }
  eventBus.on(['create.move', 'create.end'], 1500, clampCreateEvent)

  // Safety net at move end
  eventBus.on('shape.move.end', 1500, function (event: AnyObj) {
    const shapes: AnyObj[] = event.context?.shapes ?? []
    if (!shapes.length) return
    let minDx = -Infinity, minDy = -Infinity
    for (const s of shapes) {
      if (typeof s.x !== 'number') continue
      minDx = Math.max(minDx, CANVAS_MARGIN - s.x)
      minDy = Math.max(minDy, CANVAS_MARGIN - s.y)
    }
    if (isFinite(minDx)) event.dx = Math.max(event.dx, minDx)
    if (isFinite(minDy)) event.dy = Math.max(event.dy, minDy)
  })

  // Clamp resize
  eventBus.on('resize.move', 100, function (event: AnyObj) {
    const nb = event.context?.newBounds
    if (!nb) return
    if (nb.x < CANVAS_MARGIN) {
      nb.width = Math.max(1, nb.width - (CANVAS_MARGIN - nb.x))
      nb.x = CANVAS_MARGIN
    }
    if (nb.y < CANVAS_MARGIN) {
      nb.height = Math.max(1, nb.height - (CANVAS_MARGIN - nb.y))
      nb.y = CANVAS_MARGIN
    }
  })
}

BoundaryConstraint.$inject = ['eventBus']

export default {
  __init__: ['boundaryRules', 'boundaryConstraint'],
  boundaryRules:      ['type', BoundaryRules],
  boundaryConstraint: ['type', BoundaryConstraint],
}
