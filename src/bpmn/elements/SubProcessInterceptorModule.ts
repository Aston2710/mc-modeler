// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function isSubProcess(element: AnyObj): boolean {
  return element?.type === 'bpmn:SubProcess'
}

// ── Marcador ⊞ navegable ────────────────────────────────────────────────────
// Botón ⊞ abajo-centro de cada SubProcess. Al hacer clic, dispara 'subProcess.open'
// (App decide: abrir el diagrama enlazado, o pedir enlazar uno si no hay).

const NAV_MARKER_SVG =
  "<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
  "<rect x='3' y='3' width='18' height='18' rx='2'/><line x1='12' y1='3' x2='12' y2='21'/><line x1='3' y1='12' x2='21' y2='12'/></svg>"

function SubProcessNavMarker(this: AnyObj, overlays: AnyObj, eventBus: AnyObj, elementRegistry: AnyObj) {
  this._overlays = overlays
  this._markers = new Map<string, string>()
  const self = this

  const add = (element: AnyObj) => {
    if (!isSubProcess(element)) return
    self.remove(element.id)
    const btn = document.createElement('div')
    btn.title = 'Abrir / enlazar diagrama'
    btn.style.cssText =
      'width:24px;height:24px;display:grid;place-items:center;border-radius:6px;' +
      'background:var(--accent,#8b5cf6);color:#fff;cursor:pointer;pointer-events:auto;' +
      'box-shadow:0 1px 3px rgba(0,0,0,.3);'
    btn.innerHTML = NAV_MARKER_SVG
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      eventBus.fire('subProcess.open', { elementId: element.id })
    })
    const id: string = overlays.add(element, 'subproc-nav', {
      position: { bottom: -2, left: element.width / 2 - 12 },
      html: btn,
      show: { minZoom: 0.2 },
    })
    self._markers.set(element.id, id)
  }

  eventBus.on(['shape.added', 'import.done'], () => {
    try {
      elementRegistry.filter((el: AnyObj) => isSubProcess(el)).forEach(add)
    } catch { /* registro no listo */ }
  })
  eventBus.on('shape.changed', (event: AnyObj) => { if (isSubProcess(event.element)) add(event.element) })
  eventBus.on('shape.remove', (event: AnyObj) => { if (isSubProcess(event.element)) self.remove(event.element.id) })
}
SubProcessNavMarker.$inject = ['overlays', 'eventBus', 'elementRegistry']

SubProcessNavMarker.prototype.remove = function (elementId: string): void {
  const id = this._markers.get(elementId)
  if (id) {
    try { this._overlays.remove(id) } catch { /* ya removido */ }
    this._markers.delete(elementId)
  }
}

// ── Bloqueador del drilldown nativo de bpmn-js ──────────────────────────────
// Evita que el clic en el subproceso entre al plano interno nativo: usamos
// nuestra propia navegación por enlace.

function SubProcessNativeDrilldownBlocker(this: AnyObj, eventBus: AnyObj) {
  eventBus.on('drilldown.element.click', 5000, (event: AnyObj) => {
    if (isSubProcess(event.element)) {
      event.preventDefault()
      event.stopPropagation()
    }
  })
}
SubProcessNativeDrilldownBlocker.$inject = ['eventBus']

// ── Module export ─────────────────────────────────────────────────────────────

export default {
  __init__: ['subProcessNativeDrilldownBlocker', 'subProcessNavMarker'],
  subProcessNativeDrilldownBlocker: ['type', SubProcessNativeDrilldownBlocker],
  subProcessNavMarker: ['type', SubProcessNavMarker],
}
