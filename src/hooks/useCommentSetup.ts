import { useEffect } from 'react'
import * as Y from 'yjs'
import localforage from 'localforage'
import { YjsCommentBinding } from '@/collab/YjsCommentBinding'
import { setCommentBinding, useCommentStore } from '@/store/commentStore'
import { uint8ToBase64, base64ToUint8 } from '@/collab/yBpmnModel'
import { useDiagramStore } from '@/store/diagramStore'
import { useAuthStore } from '@/store/authStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { isCanvasReadyFor } from '@/collab/canvasSession'

/**
 * Local-only comment CRDT. Runs only when Supabase collab is NOT active.
 * In collab mode, useCollab handles the comment binding on the shared Y.Doc.
 */
export function useCommentSetup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelerRef: React.RefObject<any>
) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const user = useAuthStore((s) => s.user)
  // Collab mode: useCollab owns the comment binding → skip here
  const isCollabMode = isSupabaseConfigured && !!user

  useEffect(() => {
    if (!activeTabId || isCollabMode) return

    const doc = new Y.Doc()
    const binding = new YjsCommentBinding(doc)
    setCommentBinding(binding)
    let disposed = false

    useCommentStore.getState().syncFromYjs([])
    useCommentStore.getState().setPanelOpen(false)
    useCommentStore.getState().closeComposer()

    const persistKey = `mc-comments:${activeTabId}`

    void localforage.getItem<string>(persistKey).then((b64) => {
      if (disposed) return
      if (b64) {
        try { Y.applyUpdate(doc, base64ToUint8(b64)) } catch { /* corrupted, ignore */ }
      }
      binding.start()

      doc.on('update', () => {
        void localforage.setItem(persistKey, uint8ToBase64(Y.encodeStateAsUpdate(doc)))
      })

      // No adjuntar hasta que el canvas confirme que muestra ESTE diagrama.
      // attachModeler() enlaza checkOrphans() a commandStack.changed, que
      // escanea el elementRegistry vigente — si aún mostrara el diagrama
      // saliente, marcaría como huérfanos comentarios legítimos de este.
      const tryAttach = () => {
        if (disposed) return
        const m = modelerRef.current
        if (m && isCanvasReadyFor(activeTabId)) binding.attachModeler(m)
        else setTimeout(tryAttach, 150)
      }
      tryAttach()
    })

    return () => {
      disposed = true
      binding.destroy()
      setCommentBinding(null)
      doc.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, isCollabMode])
}
