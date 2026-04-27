/**
 * ScrollPanModule.ts
 *
 * Navegación del canvas:
 *
 * - Scroll vertical (rueda/trackpad 1 dedo)   → pan vertical
 * - Scroll horizontal (trackpad 2 dedos)       → pan horizontal
 * - Ctrl + scroll / Pinch                      → zoom centrado en cursor
 * - Click derecho + scroll                     → zoom centrado en cursor
 * - Click derecho + arrastrar                  → pan libre (estilo Bizagi)
 *
 * Actúa en capture phase para interceptar ANTES que ZoomScroll de diagram-js.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// ── Zoom / Pan sensitivity ────────────────────────────────────────────────────
// ZOOM_SENSITIVITY: escalado por unidad de delta (pixels). 0.001 → ~0.1 zoom
// por notch de ratón estándar (deltaY≈100). Bajar para más suavidad.
const ZOOM_SENSITIVITY = 0.001
// Paso máximo por evento — evita saltos bruscos en ruedas muy rápidas.
const ZOOM_MAX_STEP = 0.15
// Multiplicador de velocidad de pan (scroll sin zoom). 1.0 = neutro.
const PAN_SPEED = 1.0
// ─────────────────────────────────────────────────────────────────────────────

function ScrollPan(canvas: AnyObj) {
  const container: HTMLElement = canvas.getContainer()

  // ── Scroll / Zoom ─────────────────────────────────────────────────────────
  container.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()

      // Normaliza deltaMode: pixels(0)=1x, lines(1)=20px, pages(2)=100px
      const modeFactor = event.deltaMode === 0 ? 1 : event.deltaMode === 1 ? 20 : 100

      if (event.ctrlKey || (event.buttons & 2)) {
        // Escala por magnitud real del delta → trackpad suave, ratón preciso
        const rawStep = -event.deltaY * modeFactor * ZOOM_SENSITIVITY
        const zoomStep = Math.max(-ZOOM_MAX_STEP, Math.min(ZOOM_MAX_STEP, rawStep))
        const rect = container.getBoundingClientRect()
        const point = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
        const currentZoom = canvas.zoom() as number
        const nextZoom = Math.min(4, Math.max(0.1, currentZoom + zoomStep))
        canvas.zoom(nextZoom, point)
      } else {
        canvas.scroll({
          dx: -event.deltaX * modeFactor * PAN_SPEED,
          dy: -event.deltaY * modeFactor * PAN_SPEED,
        })
      }
    },
    { passive: false, capture: true }
  )

  // ── Right-click drag → Pan ────────────────────────────────────────────────
  let panning = false
  let lastX = 0
  let lastY = 0

  container.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 2) return
    e.preventDefault()
    e.stopImmediatePropagation()
    panning = true
    lastX = e.clientX
    lastY = e.clientY
    container.style.cursor = 'grabbing'
  }, { capture: true })

  // Escuchar en window: el cursor puede salir del container durante el drag
  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!panning) return
    canvas.scroll({ dx: e.clientX - lastX, dy: e.clientY - lastY })
    lastX = e.clientX
    lastY = e.clientY
  })

  const stopPan = () => {
    if (!panning) return
    panning = false
    container.style.cursor = ''
  }

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 2) stopPan()
  })

  // Evitar que aparezca el menú contextual del browser sobre el canvas
  container.addEventListener('contextmenu', (e: Event) => {
    e.preventDefault()
  })
}

ScrollPan.$inject = ['canvas']

const ScrollPanModule = {
  __init__: ['scrollPan'],
  scrollPan: ['type', ScrollPan],
}

export default ScrollPanModule
