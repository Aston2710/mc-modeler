import { useEffect, useState, useCallback } from 'react'
import { useCommentStore, type CommentThread, type Anchor } from '@/store/commentStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

interface PinState {
  threadId: string
  x: number
  y: number
  count: number
  hasOpen: boolean
  label: string
  anchor: Anchor
}

function getBBox(elements: AnyObj[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  elements.forEach((el) => {
    minX = Math.min(minX, el.x)
    minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + (el.width ?? 0))
    maxY = Math.max(maxY, el.y + (el.height ?? 0))
  })
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function scrollToAnchor(modeler: AnyObj, anchor: Anchor) {
  try {
    const registry = modeler.get('elementRegistry')
    const canvas = modeler.get('canvas')
    const selection = modeler.get('selection')
    const padding = { top: 80, bottom: 80, left: 80, right: 320 }

    if (anchor.type === 'element') {
      const el = registry.get(anchor.elementId)
      if (!el) return
      canvas.scrollToElement(el, { padding })
      selection.select(el)
    } else {
      const els = anchor.elementIds.map((id) => registry.get(id)).filter(Boolean)
      if (!els.length) return
      selection.select(els)
      const bbox = getBBox(els)
      canvas.scrollToElement({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }, { padding })
    }
  } catch { /* noop */ }
}

interface CommentsOverlayProps {
  modelerRef: React.RefObject<AnyObj>
  // Cache de pestañas (Fase 2): re-vincular listeners/overlays a la instancia
  // activa cuando cambia. Con el flag OFF vale 0 constante → sin efecto.
  activeVersion?: number
}

export function CommentsOverlay({ modelerRef, activeVersion = 0 }: CommentsOverlayProps) {
  const threads = useCommentStore((s) => s.threads)
  const setActiveThread = useCommentStore((s) => s.setActiveThread)
  const setPanelOpen = useCommentStore((s) => s.setPanelOpen)
  const [selectionPins, setSelectionPins] = useState<PinState[]>([])
  // Los hilos pueden llegar de Supabase ANTES de que el canvas termine de
  // importar el XML: en ese momento el registry aún no tiene los elementos y
  // los overlays se saltan sin re-intento (threads ya no cambia). Este tick
  // fuerza el redibujado al completarse cada import.
  const [importTick, setImportTick] = useState(0)

  useEffect(() => {
    const m = modelerRef.current
    if (!m) return
    try {
      const eb = m.get('eventBus')
      const onDone = () => setImportTick((t) => t + 1)
      eb.on('import.done', onDone)
      return () => eb.off('import.done', onDone)
    } catch { /* noop */ }
  }, [modelerRef, activeVersion])

  // Recalculate selection pin viewport positions (needs to run on viewbox change too)
  const recalcSelectionPins = useCallback(() => {
    void activeVersion // dep-señal: re-crear al cambiar la instancia activa (cache de pestañas)
    const m = modelerRef.current
    if (!m) return
    try {
      const canvas = m.get('canvas')
      const registry = m.get('elementRegistry')
      const pins: PinState[] = []
      // Mundo → pantalla a mano: diagram-js NO tiene canvas.worldToViewbox()
      // (antes lanzaba TypeError silencioso y el pin nunca se veía).
      const vb = canvas.viewbox()

      threads.forEach((t) => {
        if (t.orphaned || t.anchor.type !== 'selection') return
        const els = t.anchor.elementIds.map((id) => registry.get(id)).filter(Boolean)
        if (!els.length) return
        const bbox = getBBox(els)
        // Esquina superior derecha de la REGIÓN (bbox + padding del rect)
        pins.push({
          threadId: t.id,
          x: (bbox.x + bbox.width + 8 - vb.x) * vb.scale,
          y: (bbox.y - 8 - vb.y) * vb.scale,
          count: t.replies.length,
          hasOpen: t.status === 'open',
          label: t.anchor.elementLabel ?? `${t.anchor.elementIds.length} elementos`,
          anchor: t.anchor,
        })
      })
      setSelectionPins(pins)
    } catch { /* noop */ }
  }, [modelerRef, threads, activeVersion])

  // bpmn-js overlays: element-anchored pins + highlights for both anchor types
  useEffect(() => {
    const m = modelerRef.current
    if (!m) return

    let overlaysSvc: AnyObj, canvas: AnyObj, registry: AnyObj
    try {
      overlaysSvc = m.get('overlays')
      canvas = m.get('canvas')
      registry = m.get('elementRegistry')
    } catch { return }

    // ── Cleanup ───────────────────────────────────────────────
    try { overlaysSvc.remove({ type: 'comment-pin' }) } catch { /* noop */ }
    try { overlaysSvc.remove({ type: 'comment-hl' }) } catch { /* noop */ }
    registry.forEach((el: AnyObj) => {
      try { canvas.removeMarker(el.id, 'has-open-comment') } catch { /* noop */ }
    })

    // ── Group element-anchored threads by elementId ───────────
    const byElement = new Map<string, CommentThread[]>()

    threads.forEach((t) => {
      if (t.orphaned) return
      if (t.anchor.type === 'element') {
        const list = byElement.get(t.anchor.elementId) ?? []
        list.push(t)
        byElement.set(t.anchor.elementId, list)
      }
    })

    // ── Element pins + highlights ─────────────────────────────
    byElement.forEach((elementThreads, elementId) => {
      const el = registry.get(elementId)
      if (!el) return

      const openThreads = elementThreads.filter((t) => t.status === 'open')
      const hasOpen = openThreads.length > 0

      if (hasOpen) {
        try { canvas.addMarker(elementId, 'has-open-comment') } catch { /* noop */ }
      }

      // Highlight overlay
      const hl = document.createElement('div')
      hl.className = hasOpen ? 'comment-hl comment-hl--open' : 'comment-hl comment-hl--resolved'
      hl.style.cssText = `width:${el.width}px;height:${el.height}px;pointer-events:none;box-sizing:border-box;`
      try {
        overlaysSvc.add(elementId, 'comment-hl', { position: { top: 0, left: 0 }, html: hl, show: { minZoom: 0.2 } })
        const w = hl.parentNode
        if (w instanceof HTMLElement) w.style.pointerEvents = 'none'
      } catch { /* noop */ }

      // Pin button
      const total = elementThreads.length
      const pin = document.createElement('button')
      pin.className = `comment-pin ${hasOpen ? 'comment-pin--open' : 'comment-pin--resolved'}`
      pin.textContent = total > 9 ? '9+' : String(total)
      pin.title = `${total} comentario${total !== 1 ? 's' : ''} — ${el.businessObject?.name?.trim() || elementId}`
      pin.addEventListener('click', (e) => {
        e.stopPropagation()
        const first = openThreads[0] ?? elementThreads[0]
        setActiveThread(first.id)
        setPanelOpen(true)
        scrollToAnchor(m, first.anchor)
      })
      try {
        overlaysSvc.add(elementId, 'comment-pin', { position: { top: -11, right: 0 }, html: pin, show: { minZoom: 0.2 } })
      } catch { /* noop */ }
    })

    // ── Región de selección: un rect que abarca el bbox del grupo ─
    // Dibujado en una capa SVG propia del canvas (coordenadas de mundo):
    // se transforma solo con zoom/pan, sin recálculo manual. El servicio
    // overlays no soporta regiones multi-elemento — por eso capa SVG.
    let regionLayer: SVGGElement | null = null
    try { regionLayer = canvas.getLayer('comment-regions') } catch { /* noop */ }

    const REGION_PAD = 8
    const drawRegions = () => {
      if (!regionLayer) return
      while (regionLayer.firstChild) regionLayer.removeChild(regionLayer.firstChild)
      threads.forEach((t) => {
        if (t.orphaned || t.anchor.type !== 'selection') return
        const els = t.anchor.elementIds.map((id) => registry.get(id)).filter(Boolean)
        if (!els.length) return
        const bbox = getBBox(els)
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('x', String(bbox.x - REGION_PAD))
        rect.setAttribute('y', String(bbox.y - REGION_PAD))
        rect.setAttribute('width', String(bbox.width + REGION_PAD * 2))
        rect.setAttribute('height', String(bbox.height + REGION_PAD * 2))
        rect.setAttribute('rx', '6')
        rect.setAttribute('class',
          t.status === 'open'
            ? 'comment-region comment-region--open'
            : 'comment-region comment-region--resolved')
        regionLayer!.appendChild(rect)
      })
    }
    drawRegions()

    // Mover un shape del grupo cambia el bbox → redibujar región y pin.
    let eventBus: AnyObj = null
    const onCommandStack = () => { drawRegions(); recalcSelectionPins() }
    try {
      eventBus = m.get('eventBus')
      eventBus.on('commandStack.changed', onCommandStack)
    } catch { /* noop */ }

    // Compute initial selection pin positions
    recalcSelectionPins()

    return () => {
      try { overlaysSvc.remove({ type: 'comment-pin' }) } catch { /* noop */ }
      try { overlaysSvc.remove({ type: 'comment-hl' }) } catch { /* noop */ }
      try { eventBus?.off('commandStack.changed', onCommandStack) } catch { /* noop */ }
      if (regionLayer) {
        while (regionLayer.firstChild) regionLayer.removeChild(regionLayer.firstChild)
      }
      try {
        registry.forEach((el: AnyObj) => {
          try { canvas.removeMarker(el.id, 'has-open-comment') } catch { /* noop */ }
        })
      } catch { /* noop */ }
    }
   
  }, [modelerRef, threads, setActiveThread, setPanelOpen, recalcSelectionPins, importTick])

  // Reposition selection pins on zoom/pan
  useEffect(() => {
    const m = modelerRef.current
    if (!m) return
    try {
      const eb = m.get('eventBus')
      eb.on('canvas.viewbox.changed', recalcSelectionPins)
      return () => eb.off('canvas.viewbox.changed', recalcSelectionPins)
    } catch { /* noop */ }
  }, [modelerRef, recalcSelectionPins])

  // Selection pins rendered as React elements (bounding box positioning)
  return (
    <>
      {selectionPins.map((pin) => {
        const selThread = threads.find((t) => t.id === pin.threadId)
        if (!selThread) return null
        const openInGroup = threads.filter(
          (t) =>
            !t.orphaned &&
            t.anchor.type === 'selection' &&
            t.status === 'open' &&
            t.anchor.elementIds.some((id) =>
              (selThread.anchor as { elementIds: string[] }).elementIds?.includes(id)
            )
        )
        return (
          <button
            key={pin.threadId}
            className={`comment-pin comment-pin--selection ${pin.hasOpen ? 'comment-pin--open' : 'comment-pin--resolved'}`}
            style={{ position: 'absolute', left: pin.x + 8, top: pin.y - 11, zIndex: 25 }}
            title={`${pin.count} comentario${pin.count !== 1 ? 's' : ''} — ${pin.label}`}
            onClick={() => {
              const first = openInGroup[0] ?? selThread
              setActiveThread(first.id)
              setPanelOpen(true)
              scrollToAnchor(modelerRef.current, selThread.anchor)
            }}
          >
            {pin.count > 9 ? '9+' : pin.count}
          </button>
        )
      })}
    </>
  )
}
