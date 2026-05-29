import { useEffect } from 'react'
import * as Y from 'yjs'
import { useDiagramStore } from '@/store/diagramStore'
import { useAuthStore } from '@/store/authStore'
import { usePresenceStore } from '@/store/presenceStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { CollabChannel } from '@/collab/SupabaseProvider'
import { colorForUser, type CursorState } from '@/collab/presence'
import { isSyncable, uint8ToBase64, base64ToUint8 } from '@/collab/yBpmnModel'
import { YjsBpmnBinding, REMOTE_ORIGIN } from '@/collab/YjsBpmnBinding'
import { loadYjsState, saveYjsState } from '@/collab/yjsPersistence'

const CURSOR_THROTTLE_MS = 50
const PERSIST_DEBOUNCE_MS = 1500

/**
 * Colaboración en tiempo real para el diagrama activo:
 * presencia + cursores + co-edición CRDT (Yjs) sobre un canal de Supabase.
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

    const { setParticipants, setCursor, reset } = usePresenceStore.getState()

    const schedulePersist = () => {
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        void saveYjsState(diagramId, uint8ToBase64(Y.encodeStateAsUpdate(doc)))
      }, PERSIST_DEBOUNCE_MS)
    }

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return // no reenviar lo que llegó de fuera
      channel.sendYjsUpdate(uint8ToBase64(update))
      schedulePersist()
    }

    const startBinding = () => {
      if (disposed || binding) return
      const modeler = modelerRef.current
      if (!modeler) return
      binding = new YjsBpmnBinding(modeler, doc)
      binding.start()
    }

    const startBindingWhenReady = () => {
      if (disposed) return
      const modeler = modelerRef.current
      if (!modeler) {
        setTimeout(startBindingWhenReady, 100)
        return
      }
      const registry = modeler.get('elementRegistry')
      const hasContent = registry.getAll().some(isSyncable)
      if (hasContent) {
        startBinding()
      } else {
        const eventBus = modeler.get('eventBus')
        const onImport = () => {
          eventBus.off('import.done', onImport)
          startBinding()
        }
        eventBus.on('import.done', onImport)
        // Fallback por si la importación ya había terminado.
        setTimeout(() => {
          try { eventBus.off('import.done', onImport) } catch { /* noop */ }
          startBinding()
        }, 1500)
      }
    }

    void (async () => {
      const b64 = await loadYjsState(diagramId)
      if (disposed) return
      if (b64) {
        try { Y.applyUpdate(doc, base64ToUint8(b64), REMOTE_ORIGIN) } catch { /* estado corrupto: ignorar */ }
      }
      doc.on('update', onDocUpdate)
      channel.connect({
        onPresence: setParticipants,
        onCursor: setCursor,
        onYjsUpdate: (incoming: string) => {
          try { Y.applyUpdate(doc, base64ToUint8(incoming), REMOTE_ORIGIN) } catch { /* noop */ }
        },
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
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
      if (persistTimer) clearTimeout(persistTimer)
      void saveYjsState(diagramId, uint8ToBase64(Y.encodeStateAsUpdate(doc)))
      doc.off('update', onDocUpdate)
      binding?.destroy()
      void channel.disconnect()
      reset()
      doc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, user?.id])
}
