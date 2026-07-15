import { isBpmnReadOnly, onReadOnlyChange } from '@/bpmn/readOnlyState'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// Prioridad alta: correr antes que los proveedores/handlers por defecto para
// poder vetar (devolver false detiene la propagación en el eventBus de diagram-js).
const VETO_PRIORITY = 3000
// Prioridad baja para el contextPad: correr DESPUÉS del resto de proveedores,
// así el filtro ve TODAS las entradas ya acumuladas y puede quitarlas.
const CONTEXT_PAD_FILTER_PRIORITY = 100

// Única entrada de context pad permitida en modo solo-lectura: comentar.
const COMMENT_ENTRY = 'comment.add'

/**
 * Aplica el modo solo-lectura sobre el canvas bpmn-js cuando el usuario es
 * viewer. Choke point único: TODA mutación con reglas pasa por
 * `commandStack.canExecute` (vía Rules) — vetarlo ahí bloquea mover, crear,
 * redimensionar, conectar y bendpoints de una sola vez. Los caminos que NO
 * pasan por canExecute (edición de etiqueta por doble-clic, pegar, entradas de
 * edición del context pad) se bloquean por separado. Los comentarios NO pasan
 * por el commandStack (viven en tablas Supabase), así que siguen permitidos.
 */
function ReadOnlyGuard(
  this: AnyObj,
  eventBus: AnyObj,
  contextPad: AnyObj,
  directEditing: AnyObj
) {
  // (1) Veto de toda operación de modelado sujeta a reglas.
  eventBus.on('commandStack.canExecute', VETO_PRIORITY, () => {
    if (isBpmnReadOnly()) return false
  })

  // (2) Bloquear edición de etiqueta por doble-clic (no pasa por canExecute).
  eventBus.on('element.dblclick', VETO_PRIORITY, () => {
    if (isBpmnReadOnly()) return false
  })

  // (2b) Bloqueo duro del INICIO de cualquier arrastre que mute el diagrama
  // (mover/redimensionar/conectar/bendpoints). El veto de canExecute ya
  // revierte el comando, pero abortar el drag en el arranque evita el preview
  // que "sigue" al cursor y garantiza el bloqueo aunque un módulo custom de
  // move manipule en move.end saltándose las reglas.
  eventBus.on(
    [
      'shape.move.start',
      'elements.move',
      'resize.start',
      'connect.start',
      'global-connect.start',
      'bendpoint.move.start',
      'connectionSegment.move.start',
      'spaceTool.selection.start',
      'spaceTool.move',
    ],
    VETO_PRIORITY,
    () => {
      if (isBpmnReadOnly()) return false
    }
  )

  // (3) Defensa: si algún flujo intenta activar edición directa, cancelarla.
  eventBus.on('directEditing.activate', VETO_PRIORITY, () => {
    if (isBpmnReadOnly()) {
      try { directEditing.cancel() } catch { /* noop */ }
      return false
    }
  })

  // (4) Bloquear pegado (crea elementos sin pasar por canExecute).
  eventBus.on('copyPaste.pasteElements', VETO_PRIORITY, () => {
    if (isBpmnReadOnly()) return false
  })

  // Al cambiar de/a solo-lectura, cerrar el context pad para que se recomponga
  // con el conjunto de entradas correcto la próxima vez que se abra.
  onReadOnlyChange(() => {
    try { contextPad.close() } catch { /* noop */ }
  })
}

ReadOnlyGuard.$inject = ['eventBus', 'contextPad', 'directEditing']

/**
 * Proveedor de context pad de prioridad baja: en solo-lectura filtra las
 * entradas dejando únicamente "comentar". Corre al final de la cadena de
 * proveedores, así ve las entradas de todos (borrar, conectar, append, etc.)
 * y las elimina.
 */
function ReadOnlyContextPadProvider(this: AnyObj, contextPad: AnyObj) {
  contextPad.registerProvider(CONTEXT_PAD_FILTER_PRIORITY, this)
}

ReadOnlyContextPadProvider.$inject = ['contextPad']

function onlyComment(entries: AnyObj): AnyObj {
  if (!isBpmnReadOnly()) return entries
  const filtered: AnyObj = {}
  if (entries && entries[COMMENT_ENTRY]) filtered[COMMENT_ENTRY] = entries[COMMENT_ENTRY]
  return filtered
}

ReadOnlyContextPadProvider.prototype.getContextPadEntries = function () {
  return onlyComment
}

ReadOnlyContextPadProvider.prototype.getMultiElementContextPadEntries = function () {
  // Selección múltiple: en solo-lectura, sin entradas (no hay comentario multi).
  return (entries: AnyObj) => (isBpmnReadOnly() ? {} : entries)
}

export default {
  __init__: ['readOnlyGuard', 'readOnlyContextPadProvider'],
  readOnlyGuard: ['type', ReadOnlyGuard],
  readOnlyContextPadProvider: ['type', ReadOnlyContextPadProvider],
}
