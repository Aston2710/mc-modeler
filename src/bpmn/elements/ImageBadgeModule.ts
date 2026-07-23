import { getLinkedImages } from './imageLink'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const CAMERA_SVG =
  "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor'" +
  " stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'/>" +
  "<circle cx='12' cy='13' r='4'/></svg>"

function isConnection(el: AnyObj): boolean {
  return Array.isArray(el?.waypoints)
}

/**
 * Marca 📷 en la esquina de todo elemento con imágenes vinculadas
 * (flujo:linkedImages). Al hacer clic, dispara 'bpmn:image:view' — la app abre
 * el visor (lightbox), NUNCA muestra la imagen dentro del canvas.
 */
function ImageBadgeMarker(this: AnyObj, overlays: AnyObj, eventBus: AnyObj, elementRegistry: AnyObj) {
  this._overlays = overlays
  this._markers = new Map<string, string>()
  const self = this

  const refresh = (element: AnyObj) => {
    if (!element || isConnection(element)) return
    self.remove(element.id)
    const ids = getLinkedImages(element)
    if (ids.length === 0) return

    const badge = document.createElement('div')
    badge.className = 'image-badge'
    badge.title = ids.length > 1 ? `${ids.length} imágenes vinculadas` : 'Ver imagen'
    badge.innerHTML = CAMERA_SVG
    if (ids.length > 1) {
      const count = document.createElement('span')
      count.className = 'image-badge-count'
      count.textContent = ids.length > 9 ? '9+' : String(ids.length)
      badge.appendChild(count)
    }
    badge.addEventListener('click', (e) => {
      e.stopPropagation()
      document.dispatchEvent(new CustomEvent('bpmn:image:view', { detail: { elementId: element.id } }))
    })

    try {
      const id: string = overlays.add(element, 'image-badge', {
        position: { top: -10, right: 8 },
        html: badge,
        show: { minZoom: 0.2 },
      })
      self._markers.set(element.id, id)
    } catch { /* registro no listo */ }
  }

  const refreshAll = () => {
    try { elementRegistry.forEach(refresh) } catch { /* noop */ }
  }

  eventBus.on('import.done', refreshAll)
  eventBus.on(['shape.added', 'element.changed'], (event: AnyObj) => refresh(event.element))
  eventBus.on('shape.remove', (event: AnyObj) => self.remove(event.element?.id))
  // Cambios remotos (colaboración) llegan por commandStack.
  eventBus.on('commandStack.changed', refreshAll)
}
ImageBadgeMarker.$inject = ['overlays', 'eventBus', 'elementRegistry']

ImageBadgeMarker.prototype.remove = function (elementId: string): void {
  const id = this._markers.get(elementId)
  if (id) {
    try { this._overlays.remove(id) } catch { /* ya removido */ }
    this._markers.delete(elementId)
  }
}

export default {
  __init__: ['imageBadgeMarker'],
  imageBadgeMarker: ['type', ImageBadgeMarker],
}
