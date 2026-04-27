import { useRef, forwardRef, useImperativeHandle, useEffect, useCallback } from 'react'
import { useBpmnModeler } from '@/hooks/useBpmnModeler'

export interface BpmnCanvasHandle {
  importXml: (xml: string) => Promise<void>
  exportXml: () => Promise<string>
  exportSvg: () => Promise<string>
  undo: () => void
  redo: () => void
  zoom: (level: number | 'fit-viewport') => void
  fitToScreen: () => void
  getElementRegistry: () => unknown
  getSelectedElements: () => { id: string; businessObject: { name?: string; $type: string } }[]
  canUndo: () => boolean
  canRedo: () => boolean
  scrollToElement: (elementId: string) => void
  updateElementProperty: (elementId: string, property: string, value: string) => void
  startCreate: (bpmnType: string, event: MouseEvent) => void
}

interface BpmnCanvasProps {
  onReady?: () => void
  onChanged?: () => void
  onSelectionChange?: (ids: string[]) => void
}

export const BpmnCanvas = forwardRef<BpmnCanvasHandle, BpmnCanvasProps>(
  function BpmnCanvas({ onReady, onChanged, onSelectionChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const hScrollRef = useRef<HTMLDivElement>(null)
    const vScrollRef = useRef<HTMLDivElement>(null)
    const thumbHRef = useRef<HTMLDivElement>(null)
    const thumbVRef = useRef<HTMLDivElement>(null)

    const modeler = useBpmnModeler(containerRef, { onReady, onChanged, onSelectionChange })

    useImperativeHandle(ref, () => ({
      importXml: modeler.importXml,
      exportXml: modeler.exportXml,
      exportSvg: modeler.exportSvg,
      undo: modeler.undo,
      redo: modeler.redo,
      zoom: modeler.zoom,
      fitToScreen: modeler.fitToScreen,
      getElementRegistry: modeler.getElementRegistry,
      getSelectedElements: modeler.getSelectedElements,
      canUndo: modeler.canUndo,
      canRedo: modeler.canRedo,
      scrollToElement: modeler.scrollToElement,
      updateElementProperty: modeler.updateElementProperty,
      startCreate: modeler.startCreate,
    }))

    // ── Scrollbars visibles estilo Bizagi ──────────────────────────────────
    // Los scrollbars controlan el viewport de bpmn-js usando canvas.scroll()
    // y se actualizan cuando el viewbox cambia (scroll del trackpad, etc.)
    const updateScrollThumbs = useCallback(() => {
      const m = modeler.getModelerInstance?.()
      if (!m) return
      try {
        const canvasService = m.get('canvas')
        const vb = canvasService.viewbox()
        const wrap = wrapRef.current
        const thumbH = thumbHRef.current
        const thumbV = thumbVRef.current
        if (!wrap || !thumbH || !thumbV) return

        const ww = wrap.clientWidth
        const wh = wrap.clientHeight

        // Tamaño visible vs total del diagrama
        const totalW = Math.max(vb.inner.width * vb.scale, ww * 3)
        const totalH = Math.max(vb.inner.height * vb.scale, wh * 3)

        const thumbWPct = Math.min(100, (ww / totalW) * 100)
        const thumbHPct = Math.min(100, (wh / totalH) * 100)

        // Posición del thumb: qué tan lejos está el viewport del origen
        const scrollXPct = Math.max(0, Math.min(100 - thumbWPct,
          ((-vb.x * vb.scale) / totalW) * 100
        ))
        const scrollYPct = Math.max(0, Math.min(100 - thumbHPct,
          ((-vb.y * vb.scale) / totalH) * 100
        ))

        thumbH.style.width = `${thumbWPct}%`
        thumbH.style.left = `${scrollXPct}%`
        thumbV.style.height = `${thumbHPct}%`
        thumbV.style.top = `${scrollYPct}%`
      } catch { /* ignore */ }
    }, [modeler])

    // Drag de scrollbar horizontal
    const startHDrag = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const m = modeler.getModelerInstance?.()
      if (!m) return

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        m.get('canvas').scroll({ dx: -delta * 3, dy: 0 })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }, [modeler])

    // Drag de scrollbar vertical
    const startVDrag = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const m = modeler.getModelerInstance?.()
      if (!m) return

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY
        m.get('canvas').scroll({ dx: 0, dy: -delta * 3 })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }, [modeler])

    // Actualizar thumbs cuando el viewbox cambia
    useEffect(() => {
      const m = modeler.getModelerInstance?.()
      if (!m) return
      try {
        const eventBus = m.get('eventBus')
        eventBus.on('canvas.viewbox.changed', updateScrollThumbs)
        updateScrollThumbs()
        return () => eventBus.off('canvas.viewbox.changed', updateScrollThumbs)
      } catch { /* ignore */ }
    }, [modeler, updateScrollThumbs])

    return (
      <div ref={wrapRef} className="canvas-wrap">
        {/* Grid de fondo */}
        <div className="canvas-grid" />

        {/* Contenedor del modeler bpmn-js */}
        <div ref={containerRef} className="canvas-container" />

        {/* ── Scrollbar horizontal ── */}
        <div ref={hScrollRef} className="bpmn-scrollbar bpmn-scrollbar--h">
          <div
            ref={thumbHRef}
            className="bpmn-scrollbar__thumb"
            onMouseDown={startHDrag}
          />
        </div>

        {/* ── Scrollbar vertical ── */}
        <div ref={vScrollRef} className="bpmn-scrollbar bpmn-scrollbar--v">
          <div
            ref={thumbVRef}
            className="bpmn-scrollbar__thumb"
            onMouseDown={startVDrag}
          />
        </div>

        {/* Esquina entre los dos scrollbars */}
        <div className="bpmn-scrollbar__corner" />
      </div>
    )
  }
)
