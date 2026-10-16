import { useDiagramStore } from '@/store/diagramStore'
import { useCommentStore } from '@/store/commentStore'
import { useCollabStore } from '@/store/collabStore'

/**
 * Espera a que un hilo de comentario aparezca en el store (lo carga el binding
 * al abrir el diagrama) y entonces abre el panel y lo activa. Suscripción al
 * store + fallback por timeout si el hilo nunca llega (borrado / sin acceso).
 * Devuelve una función para cancelar.
 */
export function activateThreadWhenReady(threadId: string, timeoutMs = 20_000): () => void {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    unsub()
    clearTimeout(timer)
  }
  const tryActivate = () => {
    if (done) return
    if (!useCommentStore.getState().threads.some((t) => t.id === threadId)) return
    useCommentStore.getState().setPanelOpen(true)
    useCommentStore.getState().setActiveThread(threadId)
    finish()
  }
  const unsub = useCommentStore.subscribe(tryActivate)
  const timer = setTimeout(finish, timeoutMs)
  tryActivate()
  return finish
}

/**
 * Navegación interna (sin recargar) al destino de una notificación: abre el
 * diagrama si el usuario tiene acceso y, si se indica, enfoca el hilo. El
 * cambio a vista editor lo dispara el efecto de tabs en App. Si el diagrama no
 * está en la lista (lo acaban de compartir con la sesión ya abierta) recarga la
 * lista una vez antes de rendirse. Devuelve false si sigue sin aparecer.
 */
export async function openNotificationTarget(diagramId: string, threadId?: string | null): Promise<boolean> {
  const has = () => useDiagramStore.getState().diagrams.some((d) => d.id === diagramId)
  if (!has()) {
    // Lista y roles juntos: sin el rol, el editor no sabría si es solo lectura.
    await Promise.all([
      useDiagramStore.getState().loadAll(),
      useCollabStore.getState().loadRoles(),
    ]).catch(() => {})
    if (!has()) return false
  }
  useDiagramStore.getState().openDiagram(diagramId)
  if (threadId) activateThreadWhenReady(threadId)
  return true
}
