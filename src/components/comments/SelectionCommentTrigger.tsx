import { useEffect, useState } from 'react'
import { useCommentStore } from '@/store/commentStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const EXCLUDED = new Set([
  'bpmn:Process', 'bpmn:Collaboration', 'bpmn:LaneSet',
  'bpmn:TextAnnotation', 'label',
])

const OVERLAY_TYPE = 'selection-comment-trigger'

const BTN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`

function isCommentable(el: AnyObj): boolean {
  return !Array.isArray(el?.waypoints) && !EXCLUDED.has(el?.type)
}

// Pick anchor element: rightmost, then topmost for tie-breaking
function pickAnchor(elements: AnyObj[]): AnyObj | null {
  if (!elements.length) return null
  return elements.reduce((best, el) => {
    if (!best) return el
    const bRight = best.x + (best.width ?? 0)
    const eRight = el.x + (el.width ?? 0)
    if (eRight > bRight) return el
    if (eRight === bRight && el.y < best.y) return el
    return best
  }, null as AnyObj | null)
}

interface Props {
  modelerRef: React.RefObject<AnyObj>
  // Cache de pestañas (Fase 2): re-vincular a la instancia activa. Flag OFF → 0.
  activeVersion?: number
}

export function SelectionCommentTrigger({ modelerRef, activeVersion = 0 }: Props) {
  const [commentable, setCommentable] = useState<AnyObj[]>([])

  // Track selection changes
  useEffect(() => {
    const m = modelerRef.current
    if (!m) return
    try {
      const eb = m.get('eventBus')
      const sync = () => {
        try {
          const sel: AnyObj[] = m.get('selection').get()
          const filtered = sel.filter(isCommentable)
          setCommentable(filtered.length >= 2 ? filtered : [])
        } catch {
          setCommentable([])
        }
      }
      eb.on('selection.changed', sync)
      return () => {
        eb.off('selection.changed', sync)
        setCommentable([])
      }
    } catch { /* noop */ }
  }, [modelerRef, activeVersion])

  // Mount / remove the bpmn-js overlay whenever commentable list changes
  useEffect(() => {
    const m = modelerRef.current
    if (!m) return
    let overlays: AnyObj
    try { overlays = m.get('overlays') } catch { return }

    // Always remove stale overlay first
    try { overlays.remove({ type: OVERLAY_TYPE }) } catch { /* noop */ }

    if (commentable.length < 2) return

    const anchor = pickAnchor(commentable)
    if (!anchor) return

    const btn = document.createElement('button')
    btn.className = 'selection-comment-btn'
    btn.innerHTML = `${BTN_SVG} Comentar selección`
    btn.title = `Comentar ${commentable.length} elementos seleccionados`

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const { openComposer, setPanelOpen } = useCommentStore.getState()
      const elementIds = commentable.map((el) => el.id as string)
      const names = commentable
        .map((el) => el.businessObject?.name?.trim())
        .filter(Boolean)
      const preview = names.slice(0, 3).join(', ')
      const suffix = names.length > 3 ? '…' : ''
      const elementLabel = preview
        ? `${commentable.length} elementos: ${preview}${suffix}`
        : `${commentable.length} elementos seleccionados`
      openComposer({ type: 'selection', elementIds, elementLabel })
      setPanelOpen(true)
    })

    try {
      overlays.add(anchor.id, OVERLAY_TYPE, {
        position: { top: -40, right: 0 },
        html: btn,
        show: { minZoom: 0.3 },
      })
    } catch { /* noop */ }

    return () => {
      try { overlays.remove({ type: OVERLAY_TYPE }) } catch { /* noop */ }
    }
  }, [modelerRef, commentable])

  return null
}
