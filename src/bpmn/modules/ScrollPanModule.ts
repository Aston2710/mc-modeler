/**
 * ScrollPanModule.ts
 *
 * Reemplaza la navegación del canvas por scroll/trackpad:
 *
 * - Scroll vertical (1 dedo o rueda) → pan vertical
 * - Scroll horizontal (2 dedos horizontal en trackpad) → pan horizontal
 * - Ctrl + scroll → zoom centrado en el cursor
 * - Pinch (trackpad) → zoom (se envía como ctrlKey + wheel en browsers modernos)
 *
 * Actúa en capture phase para interceptar ANTES que ZoomScroll de diagram-js.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function ScrollPan(canvas: AnyObj) {
  const container: HTMLElement = canvas.getContainer()

  container.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()

      if (event.ctrlKey) {
        // ── Ctrl+Scroll o Pinch → Zoom centrado en cursor ──────────────
        const zoomStep = event.deltaY < 0 ? 0.1 : -0.1
        const rect = container.getBoundingClientRect()
        const point = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
        const currentZoom = canvas.zoom() as number
        const nextZoom = Math.min(4, Math.max(0.1, currentZoom + zoomStep))
        canvas.zoom(nextZoom, point)
      } else {
        // ── Scroll libre → Pan suave ────────────────────────────────────
        // deltaMode 0 = pixeles (trackpad), 1 = líneas, 2 = página
        const factor = event.deltaMode === 0 ? 1 : event.deltaMode === 1 ? 20 : 100
        canvas.scroll({
          dx: -event.deltaX * factor,
          dy: -event.deltaY * factor,
        })
      }
    },
    // capture: true → se ejecuta ANTES que los listeners bubble de diagram-js
    { passive: false, capture: true }
  )
}

ScrollPan.$inject = ['canvas']

const ScrollPanModule = {
  __init__: ['scrollPan'],
  scrollPan: ['type', ScrollPan],
}

export default ScrollPanModule
