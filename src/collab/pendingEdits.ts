/**
 * Buffer de ediciones emitidas antes de saber si el usuario puede editar.
 *
 * Mecanismo B de EXP-011. `canEdit()` devuelve `false` tanto para "este
 * usuario es viewer" como para "todavía no he cargado los roles". Tratar los
 * dos casos igual descartaba para siempre las ediciones hechas en los primeros
 * milisegundos de la sesión, sin que el usuario ni su colaborador lo supieran.
 *
 * Aquí se acumulan hasta saberlo. Al resolver:
 *   editor → se envían todas, en orden
 *   viewer → se descartan, y la propiedad de solo-lectura sigue intacta
 *
 * Que aplicar un delta tarde sea correcto no es casualidad: Yjs es un CRDT y
 * sus operaciones son conmutativas. Es justo el caso para el que sirve.
 *
 * Vive fuera del hook para poder probarse sin montar un canal de Supabase, un
 * Y.Doc y un modeler de bpmn-js.
 */

/** Tope del buffer. La ventana real son milisegundos; si crece, algo va mal. */
export const PENDING_EDITS_MAX = 200

export interface PendingEditsBuffer<T> {
  /** Encola una edición. Si está lleno, descarta la más vieja. */
  push: (update: T) => void
  /**
   * Resuelve el buffer. `canEdit` decide el destino de lo acumulado.
   * Devuelve qué pasó, para poder registrarlo.
   */
  resolve: (canEdit: boolean) => { outcome: 'sent' | 'discarded' | 'empty'; count: number; dropped: number }
  size: () => number
  /** Cuántas se perdieron por desbordamiento desde el último `resolve`. */
  droppedCount: () => number
  /** Solo para pruebas e inspección: el contenido actual, en orden. */
  peek: () => readonly T[]
}

export function createPendingEdits<T>(
  send: (update: T) => void,
  options?: { max?: number; onOverflow?: (max: number) => void }
): PendingEditsBuffer<T> {
  const max = options?.max ?? PENDING_EDITS_MAX
  let items: T[] = []
  let dropped = 0

  return {
    push(update) {
      if (items.length >= max) {
        items.shift()
        dropped += 1
        // Solo se avisa del primer desbordamiento: en un bucle, el resto es
        // ruido y el contador ya lleva la cuenta.
        if (dropped === 1) options?.onOverflow?.(max)
      }
      items.push(update)
    },

    resolve(canEdit) {
      const count = items.length
      const wasDropped = dropped
      if (count === 0) {
        dropped = 0
        return { outcome: 'empty', count: 0, dropped: wasDropped }
      }
      if (canEdit) {
        for (const update of items) send(update)
      }
      items = []
      dropped = 0
      return { outcome: canEdit ? 'sent' : 'discarded', count, dropped: wasDropped }
    },

    size: () => items.length,
    droppedCount: () => dropped,
    peek: () => items,
  }
}
