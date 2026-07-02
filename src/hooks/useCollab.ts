import { useEffect } from 'react'
import * as Y from 'yjs'
import { useDiagramStore } from '@/store/diagramStore'
import { useAuthStore } from '@/store/authStore'
import { usePresenceStore } from '@/store/presenceStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { CollabChannel } from '@/collab/SupabaseProvider'
import { colorForUser, type CursorState } from '@/collab/presence'
import { uint8ToBase64, base64ToUint8 } from '@/collab/yBpmnModel'
import { YjsBpmnBinding, REMOTE_ORIGIN } from '@/collab/YjsBpmnBinding'
import { YjsCommentBinding } from '@/collab/YjsCommentBinding'
import { setCommentBinding, useCommentStore } from '@/store/commentStore'
import { loadYjsState, saveYjsState } from '@/collab/yjsPersistence'
import { isCanvasReadyFor } from '@/collab/canvasSession'

const CURSOR_THROTTLE_MS = 50
const PERSIST_DEBOUNCE_MS = 1500
// Tope máximo esperando confirmación de que el canvas muestra este diagrama.
// Si nunca llega (import falló, XML corrupto), no forzamos el binding —
// preferible perder colaboración en esta sesión que mezclar contenido ajeno.
const BIND_CONFIRM_TIMEOUT_MS = 10000

/**
 * Colaboración en tiempo real para el diagrama activo:
 * presencia + cursores + co-edición CRDT (Yjs) sobre un canal de Supabase.
 * Incluye comentarios colaborativos en el mismo Y.Doc.
 * No hace nada en modo local (sin Supabase) o sin sesión.
 */
export function useCollab(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelerRef: React.RefObject<any>,
  wrapRef: React.RefObject<HTMLElement | null>
) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!isSupabaseConfigured || !user || !activeTabId) return
    const wrap = wrapRef.current
    if (!wrap) return

    const diagramId = activeTabId
    const name =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email ||
      'Usuario'
    const me = { userId: user.id, name, color: colorForUser(user.id) }

    const channel = new CollabChannel(diagramId, me)
    const doc = new Y.Doc()
    let binding: YjsBpmnBinding | null = null
    let disposed = false
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    let pendingImportHandler: (() => void) | null = null
    let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null
    const bindWaitStartedAt = Date.now()

    const clearPendingImportWait = () => {
      if (pendingImportHandler) {
        try { modelerRef.current?.get('eventBus').off('import.done', pendingImportHandler) } catch { /* noop */ }
        pendingImportHandler = null
      }
      if (pendingRetryTimer) { clearTimeout(pendingRetryTimer); pendingRetryTimer = null }
    }

    // Comment binding shares the same Y.Doc → sync is automatic via existing channel
    const commentBinding = new YjsCommentBinding(doc)
    setCommentBinding(commentBinding)
    useCommentStore.getState().syncFromYjs([])

    const { setParticipants, setCursor, reset } = usePresenceStore.getState()

    const schedulePersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        void saveYjsState(diagramId, uint8ToBase64(Y.encodeStateAsUpdate(doc)))
      }, PERSIST_DEBOUNCE_MS)
    }

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return
      channel.sendYjsUpdate(uint8ToBase64(update))
      schedulePersist()
    }

    const sendFullState = () => {
      try {
        channel.sendYjsUpdate(uint8ToBase64(Y.encodeStateAsUpdate(doc)))
      } catch { /* noop */ }
    }

    const startBinding = () => {
      if (disposed || binding) return
      const modeler = modelerRef.current
      if (!modeler) return
      // Defensa en profundidad: startBindingWhenReady ya validó esto antes de
      // llamar, pero nunca arrancamos el binding sin confirmación explícita
      // de que el canvas muestra ESTE diagrama — así una futura regresión que
      // llame startBinding() antes de tiempo falla cerrado, no corrompe datos.
      if (!isCanvasReadyFor(diagramId)) return
      binding = new YjsBpmnBinding(modeler, doc)
      binding.start()
      // Attach modeler for orphan detection once it's available
      commentBinding.attachModeler(modeler)
    }

    // No inferimos "listo" de heurísticas sobre el contenido del canvas
    // (p. ej. "¿tiene elementos?") — eso es exactamente lo que causaba pools
    // de OTRO diagrama filtrarse: durante un cambio de pestaña el canvas
    // sigue mostrando el diagrama anterior mientras el nuevo importa. En vez
    // de eso, esperamos la confirmación explícita de canvasSession (fencing
    // token, ver useBpmnModeler.importXml) de que este diagramId específico
    // ya terminó de renderizarse.
    const startBindingWhenReady = () => {
      if (disposed) return
      clearPendingImportWait()
      const modeler = modelerRef.current
      if (!modeler) {
        pendingRetryTimer = setTimeout(startBindingWhenReady, 100)
        return
      }
      if (isCanvasReadyFor(diagramId)) {
        startBinding()
        return
      }
      if (Date.now() - bindWaitStartedAt > BIND_CONFIRM_TIMEOUT_MS) {
        console.warn('[collab] el canvas nunca confirmó el diagrama', diagramId, '— colaboración deshabilitada para esta sesión')
        return
      }
      const eventBus = modeler.get('eventBus')
      const onImport = () => {
        // Reevaluar identidad: este import.done puede pertenecer a OTRO
        // diagrama que estaba en curso cuando arrancó este efecto.
        startBindingWhenReady()
      }
      pendingImportHandler = onImport
      eventBus.on('import.done', onImport)
      pendingRetryTimer = setTimeout(startBindingWhenReady, 300)
    }

    void (async () => {
      const blobs = await loadYjsState(diagramId)
      if (disposed) return
      // Aplicar snapshot + tail en orden. Cada blob con su propio guard: una fila
      // corrupta puntual no invalida el resto — el doc converge con lo aplicable.
      for (const b64 of blobs) {
        try { Y.applyUpdate(doc, base64ToUint8(b64), REMOTE_ORIGIN) } catch { /* fila corrupta: ignorar */ }
      }
      doc.on('update', onDocUpdate)
      commentBinding.start()
      channel.connect({
        onPresence: setParticipants,
        onCursor: setCursor,
        onYjsUpdate: (incoming: string) => {
          try { Y.applyUpdate(doc, base64ToUint8(incoming), REMOTE_ORIGIN) } catch { /* noop */ }
        },
        onSubscribed: sendFullState,
        onJoin: () => sendFullState(),
      })
      startBindingWhenReady()
    })()

    // ── Cursor local (throttled, en coords de diagrama) ──
    let lastSent = 0
    const onMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastSent < CURSOR_THROTTLE_MS) return
      lastSent = now
      const modeler = modelerRef.current
      if (!modeler) return
      try {
        const vb = modeler.get('canvas').viewbox()
        const rect = wrap.getBoundingClientRect()
        const c: CursorState = {
          x: vb.x + (e.clientX - rect.left) / vb.scale,
          y: vb.y + (e.clientY - rect.top) / vb.scale,
        }
        channel.sendCursor(c)
      } catch { /* noop */ }
    }
    const onLeave = () => channel.sendCursor(null)
    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)

    return () => {
      disposed = true
      clearPendingImportWait()
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
      if (persistTimer) clearTimeout(persistTimer)
      void saveYjsState(diagramId, uint8ToBase64(Y.encodeStateAsUpdate(doc)))
      doc.off('update', onDocUpdate)
      commentBinding.destroy()
      setCommentBinding(null)
      binding?.destroy()
      void channel.disconnect()
      reset()
      doc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, user?.id])
}
