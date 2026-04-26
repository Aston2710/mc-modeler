import { useEffect, useRef } from 'react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'

export function useAutoSave(
  getXml: () => Promise<string>,
  intervalSeconds = 30
) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const saveDiagram = useDiagramStore((s) => s.saveDiagram)
  const setUnsavedChanges = useUIStore((s) => s.setUnsavedChanges)
  const unsavedChanges = useUIStore((s) => s.unsavedChanges)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = async () => {
    const id = useDiagramStore.getState().activeTabId
    const dirty = useUIStore.getState().unsavedChanges
    if (!id || !dirty) return
    try {
      const xml = await getXml()
      await saveDiagram(id, xml)
      setUnsavedChanges(false)
    } catch {
      // silently skip — next interval will retry
    }
  }

  useEffect(() => {
    if (!unsavedChanges || !activeTabId) return

    timerRef.current = setTimeout(() => {
      void save()
    }, intervalSeconds * 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsavedChanges, activeTabId, intervalSeconds])

  return { save }
}
