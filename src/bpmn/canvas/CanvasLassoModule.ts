/**
 * CanvasLassoModule.ts  (v2 — reescrito)
 *
 * El problema con la versión anterior: MoveCanvas escucha `element.mousedown`
 * a prioridad 500 sobre el elemento ROOT (canvas vacío), no `canvas.mousedown`.
 * Esta versión intercepta el evento correcto a mayor prioridad.
 *
 * Lógica:
 * - Click+drag sobre canvas vacío (root element) → lasso selection
 * - Click sobre un elemento → selección normal (el default de bpmn-js)
 * - Pan → solo via scroll/trackpad (gestionado por ScrollPanModule)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function CanvasLasso(eventBus: AnyObj, lassoTool: AnyObj, canvas: AnyObj) {

  // element.mousedown se dispara para TODOS los elementos incluyendo el root.
  // MoveCanvas escucha a prioridad 500. Nosotros a 1200 → vamos primero.
  eventBus.on('element.mousedown', 1200, function (context: AnyObj) {
    const { element, originalEvent } = context

    // Solo botón izquierdo
    if (!originalEvent || originalEvent.button !== 0) return

    // Solo si el click fue sobre el elemento ROOT (canvas vacío, no sobre shapes)
    const rootElement = canvas.getRootElement()
    if (!element || element.id !== rootElement.id) return

    // No activar lasso si hay teclas modificadoras (Space para hand tool, etc.)
    if (originalEvent.shiftKey || originalEvent.altKey) return

    try {
      lassoTool.activateLasso(originalEvent)
      // Retornar false detiene la propagación → MoveCanvas NO recibe el evento
      return false
    } catch {
      // lassoTool no disponible
    }
  })
}

CanvasLasso.$inject = ['eventBus', 'lassoTool', 'canvas']

const CanvasLassoModule = {
  __init__: ['canvasLasso'],
  canvasLasso: ['type', CanvasLasso],
}

export default CanvasLassoModule
