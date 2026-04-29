import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function GroupMove(this: AnyObj, eventBus: AnyObj, elementRegistry: AnyObj) {
  CommandInterceptor.call(this, eventBus)

  let isShiftDown = false
  window.addEventListener('keydown', e => { if (e.key === 'Shift') isShiftDown = true })
  window.addEventListener('keyup',   e => { if (e.key === 'Shift') isShiftDown = false })
  window.addEventListener('blur',    () => { isShiftDown = false })

  function isGroup(element: AnyObj): boolean {
    return element?.businessObject?.$instanceOf?.('bpmn:Group') ?? false
  }

  function fullyInside(el: AnyObj, group: AnyObj): boolean {
    return (
      el.x                >= group.x &&
      el.y                >= group.y &&
      el.x + el.width     <= group.x + group.width &&
      el.y + el.height    <= group.y + group.height
    )
  }

  function getContainedElements(group: AnyObj): AnyObj[] {
    const allEls: AnyObj[] = elementRegistry.getAll()

    // Pass 1: non-label shapes fully inside group
    const containedIds = new Set<string>()
    const nonLabels: AnyObj[] = []
    for (const el of allEls) {
      if (el === group || el.waypoints) continue
      if (el.type === 'label') continue
      if (el.businessObject?.$instanceOf?.('bpmn:Participant')) continue
      if (el.businessObject?.$instanceOf?.('bpmn:Lane')) continue
      if (typeof el.x !== 'number') continue
      if (fullyInside(el, group)) {
        nonLabels.push(el)
        containedIds.add(el.id)
      }
    }

    // Pass 2: labels — include only when their labelTarget is also contained
    const labels: AnyObj[] = []
    for (const el of allEls) {
      if (el.type !== 'label') continue
      if (typeof el.x !== 'number') continue
      const target = el.labelTarget
      if (!target) continue
      if (target.waypoints) {
        // Connection label: move only when both endpoints are contained
        if (containedIds.has(target.source?.id) && containedIds.has(target.target?.id)) {
          labels.push(el)
        }
      } else {
        // Shape label: move with its shape
        if (containedIds.has(target.id)) labels.push(el)
      }
    }

    return [...nonLabels, ...labels]
  }

  // Single hook covers both mouse drag and keyboard arrows.
  // Shift held = move frame only (no contents).
  this.preExecute('elements.move', 1500, function(event: AnyObj) {
    if (isShiftDown) return

    const context = event.context
    const shapes: AnyObj[] = context.shapes || []
    const extra: AnyObj[] = []

    for (const shape of shapes) {
      if (!isGroup(shape)) continue
      for (const el of getContainedElements(shape)) {
        if (!shapes.includes(el) && !extra.includes(el)) extra.push(el)
      }
    }

    if (extra.length > 0) context.shapes = [...shapes, ...extra]
  })
}

GroupMove.$inject = ['eventBus', 'elementRegistry']
GroupMove.prototype = Object.create(CommandInterceptor.prototype)

export default {
  __init__: ['groupMove'],
  groupMove: ['type', GroupMove],
}
