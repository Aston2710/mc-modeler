import * as Y from 'yjs'

/**
 * Piezas del protocolo de sincronización en vivo (sin persistencia):
 *
 * 1. Coalescedor de broadcasts: durante un drag, bpmn-js genera un update de
 *    Yjs cada ~40ms → 1 mensaje de Realtime por update satura el canal
 *    (rate limits de Supabase → drops silenciosos → divergencia). Fusionar
 *    los deltas de una ventana corta en UN mensaje (Y.mergeUpdates) baja
 *    ~25 msg/s a ~7 sin latencia perceptible.
 *
 * 2. Anti-entropía por state vector: el broadcast es fire-and-forget — un
 *    mensaje perdido sin desconexión = doc divergente PARA SIEMPRE en esa
 *    sesión (el handshake onSubscribed/onJoin solo cubre entrar/salir).
 *    Remedio estándar de Yjs: publicar periódicamente el state vector
 *    propio (bytes); cada peer responde con el diff exacto que nos falta
 *    (Y.encodeStateAsUpdate(doc, sv)). Convergencia garantizada del doc
 *    aunque el transporte pierda mensajes.
 */

export const BROADCAST_COALESCE_MS = 150
export const ANTIENTROPY_INTERVAL_MS = 20000

export interface Coalescer {
  push(update: Uint8Array): void
  /** Envía inmediatamente lo pendiente (p. ej. al cerrar la sesión). */
  flush(): void
  dispose(): void
}

/** Acumula deltas y los envía fusionados en ventanas de `windowMs`. */
export function createBroadcastCoalescer(
  send: (merged: Uint8Array) => void,
  windowMs: number = BROADCAST_COALESCE_MS
): Coalescer {
  let pending: Uint8Array[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (disposed || pending.length === 0) return
    const merged = pending.length === 1 ? pending[0] : Y.mergeUpdates(pending)
    pending = []
    send(merged)
  }

  return {
    push(update: Uint8Array) {
      if (disposed) return
      pending.push(update)
      if (!timer) timer = setTimeout(flush, windowMs)
    },
    flush,
    dispose() {
      // Volcar lo pendiente antes de morir: son los últimos ms de edición.
      flush()
      disposed = true
    },
  }
}

/** State vector propio, listo para difundir. */
export function encodeOwnStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc)
}

/**
 * Responde a un state vector ajeno: devuelve el diff que al otro le falta,
 * o null si no le falta nada (update vacío de Yjs = 2 bytes [0 structs, 0 ds]).
 */
export function diffForPeer(doc: Y.Doc, remoteStateVector: Uint8Array): Uint8Array | null {
  try {
    const diff = Y.encodeStateAsUpdate(doc, remoteStateVector)
    return diff.length > 2 ? diff : null
  } catch {
    // sv corrupto/ajeno → ignorar (el próximo tick lo reintenta)
    return null
  }
}
