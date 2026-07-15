import { useEffect, useRef } from 'react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { useCollabStore } from '@/store/collabStore'
import { buildThumbnail, type CropRect } from '@/utils/thumbnailUtils'
import { isCanvasReadyFor } from '@/collab/canvasSession'

export function useAutoSave(
  getXml: () => Promise<string>,
  getSvg: () => Promise<string>,
  getThumbCrop?: () => CropRect | null,
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
    // Viewer (solo lectura): NUNCA escribir. Un cambio remoto puede marcar el
    // canvas como sucio; sin este guard el autosave del viewer intentaría
    // guardar → RLS lo rechaza y dispara el aviso de conflicto CAS. El diagrama
    // es inmutable para el viewer: no hay ninguna ruta de escritura.
    if (!useCollabStore.getState().canEdit(id)) return
    // El timer puede disparar justo durante un cambio de pestaña: si el
    // canvas todavía muestra el diagrama saliente, exportarlo guardaría su
    // contenido bajo el id del diagrama entrante. Esperar al siguiente ciclo.
    if (!isCanvasReadyFor(id)) return
    try {
      const [xml, thumbnail] = await Promise.all([
        getXml(),
        buildThumbnail(getSvg, getThumbCrop).catch(() => null),
      ])
      await saveDiagram(id, xml, undefined, thumbnail)
      setUnsavedChanges(false)
    } catch (e) {
      // skip — next interval will retry
      console.warn('[Flujo] autosave falló:', e)
    }
  }
  useEffect(() => {
    if (!unsavedChanges || !activeTabId) return

    // Jitter 0–5s: en co-edición los timers de los colaboradores se disparan por
    // los mismos eventos remotos y quedan sincronizados → sus guardados chocan
    // en cada ciclo (carrera CAS). El jitter los decorrelaciona.
    timerRef.current = setTimeout(() => {
      void save()
    }, intervalSeconds * 1000 + Math.random() * 5000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsavedChanges, activeTabId, intervalSeconds])

  return { save }
}