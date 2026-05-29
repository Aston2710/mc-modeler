// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function isSubProcess(element: AnyObj): boolean {
  return element?.type === 'bpmn:SubProcess'
}

function svgToImg(svgDataUrl: string): HTMLElement {
  const img = document.createElement('img')
  img.src = svgDataUrl
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;'
  return img
}

// ── Overlay manager ───────────────────────────────────────────────────────────

function SubProcessOverlayManager(this: AnyObj, overlays: AnyObj, eventBus: AnyObj) {
  this._overlays = overlays
  this._expanded = new Map<string, string>()
  const self = this

  eventBus.on('subProcess.thumbnailUpdated', (event: AnyObj) => {
    if (self._expanded.has(event.elementId)) {
      self.updateOverlay(event.elementId, event.thumbnail)
    }
  })

  eventBus.on('shape.remove', (event: AnyObj) => {
    if (isSubProcess(event.element)) self.removeOverlay(event.element.id)
  })
}
SubProcessOverlayManager.$inject = ['overlays', 'eventBus']

SubProcessOverlayManager.prototype.isExpanded = function(elementId: string): boolean {
  return this._expanded.has(elementId)
}

SubProcessOverlayManager.prototype.expand = function(element: AnyObj, thumbnail: string): void {
  this.removeOverlay(element.id)
  const container = document.createElement('div')
  container.style.cssText = `position:absolute;inset:0;width:${element.width}px;height:${element.height}px;overflow:hidden;pointer-events:none;background:white;border-radius:4px;`
  container.appendChild(svgToImg(thumbnail))
  const overlayId: string = this._overlays.add(element, 'subproc-thumb', {
    position: { top: 0, left: 0 },
    html: container,
    show: { minZoom: 0.1, maxZoom: 10 },
  })
  this._expanded.set(element.id, overlayId)
}

SubProcessOverlayManager.prototype.collapse = function(elementId: string): void {
  this.removeOverlay(elementId)
}

SubProcessOverlayManager.prototype.updateOverlay = function(elementId: string, thumbnail: string): void {
  const overlayId = this._expanded.get(elementId)
  if (!overlayId) return
  try {
    const overlay = this._overlays.get(overlayId)
    if (overlay?.html) {
      const img = overlay.html.querySelector('img')
      if (img) img.src = thumbnail
    }
  } catch { /* overlay may have been removed */ }
}

SubProcessOverlayManager.prototype.removeOverlay = function(elementId: string): void {
  const overlayId = this._expanded.get(elementId)
  if (overlayId) {
    try { this._overlays.remove(overlayId) } catch { /* already removed */ }
    this._expanded.delete(elementId)
  }
}

// ── Context pad provider ──────────────────────────────────────────────────────

function SubProcessContextPadProvider(
  this: AnyObj,
  contextPad: AnyObj,
  eventBus: AnyObj,
  overlayManager: AnyObj,
) {
  this._eventBus = eventBus
  this._overlayManager = overlayManager
  this._thumbnails = new Map<string, string>()
  const self = this

  contextPad.registerProvider(500, this)

  eventBus.on('subProcess.thumbnailUpdated', (event: AnyObj) => {
    self._thumbnails.set(event.elementId, event.thumbnail)
  })
  eventBus.on('subProcess.thumbnailCleared', (event: AnyObj) => {
    self._thumbnails.delete(event.elementId)
  })
}
SubProcessContextPadProvider.$inject = ['contextPad', 'eventBus', 'subProcessOverlayManager']

SubProcessContextPadProvider.prototype.getContextPadEntries = function(element: AnyObj) {
  if (!isSubProcess(element)) return {}

  const eventBus = this._eventBus
  const overlayManager = this._overlayManager
  const hasThumbnail = this._thumbnails.has(element.id)
  const isExpanded = overlayManager.isExpanded(element.id)
  const elementId: string = element.id
  const entries: AnyObj = {}

  entries['subProcess.edit'] = {
    group: 'subproc',
    title: 'Editar subproceso',
    imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/%3E%3Cpath d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'/%3E%3C/svg%3E",
    action: {
      click(_event: MouseEvent) {
        eventBus.fire('subProcess.openEditor', { elementId })
      },
    },
  }

  if (hasThumbnail) {
    entries['subProcess.toggleExpand'] = {
      group: 'subproc',
      title: isExpanded ? 'Colapsar subproceso' : 'Expandir subproceso',
      imageUrl: isExpanded
        ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='4 14 10 14 10 20'/%3E%3Cpolyline points='20 10 14 10 14 4'/%3E%3Cline x1='10' y1='14' x2='3' y2='21'/%3E%3Cline x1='21' y1='3' x2='14' y2='10'/%3E%3C/svg%3E"
        : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='15 3 21 3 21 9'/%3E%3Cpolyline points='9 21 3 21 3 15'/%3E%3Cline x1='21' y1='3' x2='14' y2='10'/%3E%3Cline x1='3' y1='21' x2='10' y2='14'/%3E%3C/svg%3E",
      action: {
        click(_event: MouseEvent) {
          eventBus.fire('subProcess.toggleExpand', { elementId, element })
        },
      },
    }
  }

  return entries
}

// ── Native drilldown blocker ──────────────────────────────────────────────────

function SubProcessNativeDrilldownBlocker(this: AnyObj, eventBus: AnyObj) {
  eventBus.on('drilldown.element.click', 5000, (event: AnyObj) => {
    if (isSubProcess(event.element)) {
      event.preventDefault()
      event.stopPropagation()
    }
  })
}
SubProcessNativeDrilldownBlocker.$inject = ['eventBus']

// ── Delete notifier ───────────────────────────────────────────────────────────
// Fires subProcess.delete when a bpmn:SubProcess shape is removed from the canvas.
// App.tsx listens to this via onSubProcessOpen (prefixed '__delete__') to clean up
// the associated child diagram from the store and IndexedDB.

function SubProcessDeleteNotifier(this: AnyObj, eventBus: AnyObj) {
  eventBus.on('shape.remove', (event: AnyObj) => {
    if (isSubProcess(event.element)) {
      eventBus.fire('subProcess.delete', { elementId: event.element.id })
    }
  })
}
SubProcessDeleteNotifier.$inject = ['eventBus']

// ── Module export ─────────────────────────────────────────────────────────────

export default {
  __init__: ['subProcessContextPadProvider', 'subProcessNativeDrilldownBlocker', 'subProcessOverlayManager', 'subProcessDeleteNotifier'],
  subProcessOverlayManager: ['type', SubProcessOverlayManager],
  subProcessContextPadProvider: ['type', SubProcessContextPadProvider],
  subProcessNativeDrilldownBlocker: ['type', SubProcessNativeDrilldownBlocker],
  subProcessDeleteNotifier: ['type', SubProcessDeleteNotifier],
}