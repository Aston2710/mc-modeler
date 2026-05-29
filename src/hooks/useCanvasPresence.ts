import { useEffect, useRef } from 'react'
import { useDiagramStore } from '@/store/diagramStore'
import { useAuthStore } from '@/store/authStore'
import { usePresenceStore } from '@/store/presenceStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { CollabChannel } from '@/collab/SupabaseProvider'
import { colorForUser, type CursorState } from '@/collab/presence'

const CURSOR_THROTTLE_MS = 50

/**
 * Conecta el canal de presencia para el diagrama activo y emite el cursor local.
 * No hace nada en modo local (sin Supabase) o sin sesión.
 */
export function useCanvasPresence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelerRef: React.RefObject<any>,
  wrapRef: React.RefObject<HTMLElement | null>
) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const user = useAuthStore((s) => s.user)
  const channelRef = useRef<CollabChannel | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !user || !activeTabId) return
    const wrap = wrapRef.current
    if (!wrap) return

    const name =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email ||
      'Usuario'

    const channel = new CollabChannel(activeTabId, {
      userId: user.id,
      name,
      color: colorForUser(user.id),
    })
    channelRef.current = channel

    const { setParticipants, setCursor, reset } = usePresenceStore.getState()
    channel.connect({
      onPresence: setParticipants,
      onCursor: setCursor,
    })

    // Emisión del cursor local (throttled), en coordenadas de diagrama.
    let lastSent = 0
    const toDiagramCoords = (e: MouseEvent): CursorState | null => {
      const modeler = modelerRef.current
      if (!modeler) return null
      try {
        const vb = modeler.get('canvas').viewbox()
        const rect = wrap.getBoundingClientRect()
        return {
          x: vb.x + (e.clientX - rect.left) / vb.scale,
          y: vb.y + (e.clientY - rect.top) / vb.scale,
        }
      } catch {
        return null
      }
    }

    const onMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastSent < CURSOR_THROTTLE_MS) return
      lastSent = now
      const c = toDiagramCoords(e)
      if (c) channel.sendCursor(c)
    }
    const onLeave = () => channel.sendCursor(null)

    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)

    return () => {
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
      void channel.disconnect()
      channelRef.current = null
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, user?.id])

  return channelRef
}
