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
      const m = modeler.modelerRef.current
      if (!m) return
      try {
        const canvasService = m.get('canvas')
        const vb = canvasService.viewbox()
        const page = m.get('canvasPage')?.getBounds?.()
        const wrap = wrapRef.current
        const thumbH = thumbHRef.current
        const thumbV = thumbVRef.current
        if (!wrap || !thumbH || !thumbV) return

        const ww = wrap.clientWidth
        const wh = wrap.clientHeight

        // Scrollable area in diagram coords (page bounds or fallback)
        const totalW = page ? page.w : Math.max(vb.inner.width, (ww / vb.scale) * 3)
        const totalH = page ? page.h : Math.max(vb.inner.height, (wh / vb.scale) * 3)

        // vb.width/height = viewport size in diagram coords
        const thumbWPct = Math.min(100, (vb.width / totalW) * 100)
        const thumbHPct = Math.min(100, (vb.height / totalH) * 100)

        // vb.x/y = diagram coord at top-left of viewport (clamped ≥0)
        // thumb% = how far through the scrollable range we are
        const maxScrollX = Math.max(0, totalW - vb.width)
        const maxScrollY = Math.max(0, totalH - vb.height)
        const scrollXPct = maxScrollX > 0
          ? Math.max(0, Math.min(100 - thumbWPct, (vb.x / maxScrollX) * (100 - thumbWPct)))
          : 0
        const scrollYPct = maxScrollY > 0
          ? Math.max(0, Math.min(100 - thumbHPct, (vb.y / maxScrollY) * (100 - thumbHPct)))
          : 0

        thumbH.style.width = `${thumbWPct}%`
        thumbH.style.left = `${scrollXPct}%`
        thumbV.style.height = `${thumbHPct}%`
        thumbV.style.top = `${scrollYPct}%`
      } catch { /* ignore */ }
    }, [modeler])

    // Drag de scrollbar horizontal — incremental, scaled to actual scroll range
    const startHDrag = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      let lastX = e.clientX
      const m = modeler.modelerRef.current
      if (!m) return

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - lastX
        lastX = ev.clientX
        if (delta === 0) return
        const canvasSvc = m.get('canvas')
        const vb = canvasSvc.viewbox()
        const page = m.get('canvasPage')?.getBounds?.()
        const totalW = page ? page.w : Math.max(vb.inner.width, (vb.width) * 3)
        const maxScrollX = Math.max(1, totalW - vb.width)
        const track = hScrollRef.current
        const thumbW = thumbHRef.current?.clientWidth ?? 0
        const scrollableTrack = Math.max(1, (track?.clientWidth ?? 1) - thumbW)
        // delta px on thumb → proportional scroll in diagram coords → convert to screen px
        canvasSvc.scroll({ dx: -(delta / scrollableTrack) * maxScrollX * vb.scale, dy: 0 })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }, [modeler])

    // Drag de scrollbar vertical — incremental, scaled to actual scroll range
    const startVDrag = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      let lastY = e.clientY
      const m = modeler.modelerRef.current
      if (!m) return

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientY - lastY
        lastY = ev.clientY
        if (delta === 0) return
        const canvasSvc = m.get('canvas')
        const vb = canvasSvc.viewbox()
        const page = m.get('canvasPage')?.getBounds?.()
        const totalH = page ? page.h : Math.max(vb.inner.height, (vb.height) * 3)
        const maxScrollY = Math.max(1, totalH - vb.height)
        const track = vScrollRef.current
        const thumbH = thumbVRef.current?.clientHeight ?? 0
        const scrollableTrack = Math.max(1, (track?.clientHeight ?? 1) - thumbH)
        canvasSvc.scroll({ dx: 0, dy: -(delta / scrollableTrack) * maxScrollY * vb.scale })
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
      const m = modeler.modelerRef.current
      if (!m) return
      try {
        const eventBus = m.get('eventBus')
        eventBus.on('canvas.viewbox.changed', updateScrollThumbs)
        updateScrollThumbs()
        return () => eventBus.off('canvas.viewbox.changed', updateScrollThumbs)
      } catch { /* ignore */ }
    }, [modeler, updateScrollThumbs])

    // Drag and drop nativo para archivos de imagen (evitando que bpmn-js se trague el evento)
    useEffect(() => {
      const wrap = wrapRef.current
      if (!wrap) return

      const preventDef = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
      }

      const handleNativeDrop = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const file = e.dataTransfer?.files?.[0]
        if (file && file.type.startsWith('image/')) {
          const m = modeler.modelerRef.current
          if (!m) return

          const canvas = m.get('canvas')
          const viewbox = canvas.viewbox()
          
          const rect = wrap.getBoundingClientRect()
          const clientX = e.clientX - rect.left
          const clientY = e.clientY - rect.top
          
          const svgX = Math.round(viewbox.x + (clientX / viewbox.scale))
          const svgY = Math.round(viewbox.y + (clientY / viewbox.scale))

          const position = { x: svgX, y: svgY }
          const target = canvas.getRootElement()

          const reader = new FileReader()
          reader.onload = (event) => {
            const img = new Image()
            img.onload = () => {
              const tempCanvas = document.createElement('canvas')
              const MAX_WIDTH = 2048
              const MAX_HEIGHT = 2048
              let width = img.width
              let height = img.height

              if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH }
              } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT }
              }
              tempCanvas.width = width
              tempCanvas.height = height
              const ctx = tempCanvas.getContext('2d')
              ctx?.drawImage(img, 0, 0, width, height)
              
              const dataUrl = tempCanvas.toDataURL('image/webp', 0.90)
              
              const bo = m.get('bpmnFactory').create('bpmn:TextAnnotation', { text: '[IMAGE:' + dataUrl + ']' })
              const newShape = m.get('elementFactory').createShape({ type: 'bpmn:TextAnnotation', businessObject: bo })
              m.get('modeling').createShape(newShape, position, target)
            }
            img.src = event.target?.result as string
          }
          reader.readAsDataURL(file)
        }
      }

      wrap.addEventListener('dragenter', preventDef)
      wrap.addEventListener('dragover', preventDef)
      wrap.addEventListener('drop', handleNativeDrop)

      return () => {
        wrap.removeEventListener('dragenter', preventDef)
        wrap.removeEventListener('dragover', preventDef)
        wrap.removeEventListener('drop', handleNativeDrop)
      }
    }, [modeler])

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
