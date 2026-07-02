import { useEffect, useRef } from 'react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { buildThumbnail } from '@/utils/thumbnailUtils'
import { isCanvasReadyFor } from '@/collab/canvasSession'

export function useAutoSave(
  getXml: () => Promise<string>,
  getSvg: () => Promise<string>,
  intervalSeconds = 20
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
    // El timer puede disparar justo durante un cambio de pestaña: si el
    // canvas todavía muestra el diagrama saliente, exportarlo guardaría su
    // contenido bajo el id del diagrama entrante. Esperar al siguiente ciclo.
    if (!isCanvasReadyFor(id)) return
    try {
      const [xml, thumbnail] = await Promise.all([
        getXml(),
        buildThumbnail(getSvg).catch(() => null),
      ])
      await saveDiagram(id, xml, undefined, thumbnail)
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