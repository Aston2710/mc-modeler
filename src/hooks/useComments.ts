import { useEffect } from 'react'
import { SupabaseCommentBinding } from '@/collab/SupabaseCommentBinding'
import { setCommentBinding, useCommentStore } from '@/store/commentStore'
import { useDiagramStore } from '@/store/diagramStore'
import { useAuthStore } from '@/store/authStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { isCanvasReadyFor } from '@/collab/canvasSession'

/**
 * Comentarios colaborativos del diagrama activo sobre tablas Supabase + Realtime.
 * Solo corre en modo colaborativo (Supabase + sesión); el modo local usa
 * useCommentSetup (YjsCommentBinding + localforage).
 *
 * Desacoplado de useCollab a propósito: los comentarios ya no viven en el Y.Doc
 * (ADR persistence-source §6.2a), así el pivote de Yjs no los toca.
 */
export function useComments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelerRef: React.RefObject<any>,
  // Cache de pestañas (Fase 2): re-adjuntar el binding a la instancia activa.
  activeVersion = 0
) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!isSupabaseConfigured || !user || !activeTabId) return
    const diagramId = activeTabId

    const binding = new SupabaseCommentBinding(diagramId)
    setCommentBinding(binding)
    // Limpiar hilos del diagrama anterior mientras carga (evita flash de comentarios ajenos).
    useCommentStore.getState().syncFromYjs([])
    let disposed = false

    void binding.start()

    // No adjuntar el modeler hasta que el canvas confirme que muestra ESTE
    // diagrama: checkOrphans() escanea el elementRegistry vigente — si aún
    // mostrara el diagrama saliente, marcaría huérfanos comentarios legítimos.
    const tryAttach = () => {
      if (disposed) return
      const m = modelerRef.current
      if (m && isCanvasReadyFor(diagramId)) binding.attachModeler(m)
      else setTimeout(tryAttach, 150)
    }
    tryAttach()

    return () => {
      disposed = true
      binding.destroy()
      setCommentBinding(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, user?.id, activeVersion])
}
