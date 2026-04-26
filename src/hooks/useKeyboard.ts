import { useEffect, useRef } from 'react'
import { useUIStore } from '@/store/uiStore'

interface KeyboardHandlers {
  onSave?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onNew?: () => void
  onValidate?: () => void
}

export function useKeyboard(handlers: KeyboardHandlers) {
  const openModal = useUIStore((s) => s.openModal)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey
      const tag = (e.target as HTMLElement).tagName.toLowerCase()

      if (['input', 'textarea', 'select'].includes(tag)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }

      const h = handlersRef.current
      if (meta && e.key === 's') {
        e.preventDefault()
        h.onSave?.()
      } else if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        h.onUndo?.()
      } else if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        h.onRedo?.()
      } else if (meta && e.key === 'n') {
        e.preventDefault()
        h.onNew?.()
      } else if (e.key === '?' || (meta && e.key === '/')) {
        e.preventDefault()
        openModal('shortcuts')
      } else if (e.key === 'F5' || (meta && e.key === 'v' && e.shiftKey)) {
        e.preventDefault()
        h.onValidate?.()
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  // openModal is stable (Zustand action) — handlers via ref, no need in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openModal])
}
