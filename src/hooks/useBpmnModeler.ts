import { useEffect, useRef, useCallback } from 'react'
// bpmn-js ships CommonJS with incomplete types — cast throughout via any
 
// @ts-ignore
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { useUIStore } from '@/store/uiStore'
import { MODELER_CONFIG } from '@/bpmn/config'
import { BPMN_ELEMENTS } from '@/domain/bpmnElements'
import { ELEMENT_SIZES } from '@/bpmn/ElementSizes'
import { PHASE_ID_PREFIX, isPhase, setPhaseName, setPhaseColor } from '@/bpmn/elements/phaseUtil'
import { getLinkedDiagram as readLink, setLinkedDiagram as writeLink } from '@/bpmn/elements/subProcessLink'
import { beginImport, completeImport } from '@/collab/canvasSession'
import { forceCanonicalBpmnPrefix } from '@/utils/normalizeBpmnXml'
import { isBpmnReadOnly } from '@/bpmn/readOnlyState'


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

interface UseBpmnModelerOptions {
  onReady?: () => void
  onChanged?: () => void
  onSelectionChange?: (ids: string[]) => void
  onSubProcessOpen?: (elementId: string) => void
}

export function useBpmnModeler(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseBpmnModelerOptions = {}
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelerRef = useRef<any>(null)
  const setZoom = useUIStore((s) => s.setZoom)
  const setSelectedElements = useUIStore((s) => s.setSelectedElements)

  const onReadyRef = useRef(options.onReady)
  const onChangedRef = useRef(options.onChanged)
  const onSelectionChangeRef = useRef(options.onSelectionChange)
  const onSubProcessOpenRef = useRef(options.onSubProcessOpen)
  onReadyRef.current = options.onReady
  onChangedRef.current = options.onChanged
  onSelectionChangeRef.current = options.onSelectionChange
  onSubProcessOpenRef.current = options.onSubProcessOpen

  useEffect(() => {
    if (!containerRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = new BpmnModeler({ container: containerRef.current, ...MODELER_CONFIG }) as any
    modelerRef.current = modeler

    try {
      const contextPad = modeler.get('contextPad')
      if (contextPad && typeof contextPad.getPad === 'function') {
        const originalGetPad = contextPad.getPad.bind(contextPad)
        contextPad.getPad = function(target: unknown) {
          const isOpen = contextPad.isOpen(target)
          const html = isOpen
            ? contextPad._current?.html
            : contextPad._createHtml(target)
          return { html }
        }
        void originalGetPad
      }
    } catch {
      // Si la API interna cambia, fallar silenciosamente
    }

    const eventBus = modeler.get('eventBus')

    eventBus.on('commandStack.changed', () => {
      onChangedRef.current?.()
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBus.on('selection.changed', ({ newSelection }: { newSelection: any[] }) => {
      const ids = newSelection.map((el: { id: string }) => el.id)
      setSelectedElements(ids)
      onSelectionChangeRef.current?.(ids)
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBus.on('canvas.viewbox.changed', ({ viewbox }: { viewbox: any }) => {
      setZoom(Math.round(viewbox.scale * 100) / 100)
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBus.on('create.end', 2000, (event: any) => {
      const { context, x, y } = event
      const { shape, target } = context
      const position = { x, y }
      if (shape.type === 'bpmn:TextAnnotation' && shape.businessObject.text === '[IMAGE_PENDING]') {
        event.preventDefault()
        event.stopPropagation()
        if (!target) return false
        useUIStore.getState().setImageUploadContext({
          onConfirm: (url: string) => {
            const bo = modeler.get('bpmnFactory').create('bpmn:TextAnnotation', { text: '[IMAGE:' + url + ']' })
            const newShape = modeler.get('elementFactory').createShape({ type: 'bpmn:TextAnnotation', businessObject: bo })
            modeler.get('modeling').createShape(newShape, position, target)
          }
        })
        useUIStore.getState().openModal('imageUpload')
        return false
      }
    })

    // Sub-process: clic en el marcador ⊞ → App decide abrir/enlazar.
    eventBus.on('subProcess.open', (event: AnyObj) => {
      onSubProcessOpenRef.current?.(event.elementId)
    })

    // Signal that the modeler is ready — callers can now safely call importXml
    onReadyRef.current?.()

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      if (active) {
        const tag = active.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || active.isContentEditable) {
          return
        }
      }

      const meta = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      // Solo-lectura (viewer): copiar sigue permitido (no muta), pero pegar,
      // borrar y mover con teclado quedan bloqueados.
      const readOnly = isBpmnReadOnly()

      if (meta && key === 'c') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const selection = (modeler as any).get('selection').get()
          if (selection && selection.length > 0) {
            e.preventDefault()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(modeler as any).get('editorActions').trigger('copy')
          }
        } catch { /* ignore */ }
        return
      }

      if (meta && key === 'v') {
        if (readOnly) { e.preventDefault(); return }
        try {
          e.preventDefault()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(modeler as any).get('editorActions').trigger('paste')
        } catch { /* ignore */ }
        return
      }

      if (readOnly && (e.key === 'Delete' || e.key === 'Backspace' || e.key.startsWith('Arrow'))) {
        // Viewer: sin borrar ni mover elementos.
        if (e.key !== 'Backspace') e.preventDefault()
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const selection = (modeler as any).get('selection').get()
          if (selection && selection.length > 0) {
            e.preventDefault()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(modeler as any).get('editorActions').trigger('removeSelection')
          }
        } catch {
          // modeler may be unmounting or editorActions not available
        }
      } else if (e.key.startsWith('Arrow')) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const selection = (modeler as any).get('selection').get()
          if (selection && selection.length > 0) {
            e.preventDefault()
            const direction = e.key.replace('Arrow', '').toLowerCase()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(modeler as any).get('editorActions').trigger('moveSelection', {
              direction,
              accelerated: e.shiftKey || e.ctrlKey || e.metaKey
            })
          }
        } catch {
          // modeler may be unmounting or editorActions not available
        }
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target.classList && target.classList.contains('djs-direct-editing-content')))) {
        e.stopPropagation()
      }
    }

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target.classList && target.classList.contains('djs-direct-editing-content')))) {
        target.setAttribute('spellcheck', 'true')
        target.setAttribute('lang', 'es')
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener('contextmenu', handleContextMenu, true)
    window.addEventListener('focus', handleFocus, true)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme' &&
          modelerRef.current
        ) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const m = modelerRef.current as any
            const registry = m.get('elementRegistry')
            const drawingModule = m.get('graphicsFactory')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            registry.getAll().forEach((element: any) => {
              try {
                const gfx = registry.getGraphics(element)
                if (gfx) {
                  drawingModule.update(
                    element.waypoints ? 'connection' : 'shape',
                    element,
                    gfx
                  )
                }
              } catch {
                // ignorar errores individuales de elementos
              }
            })
          } catch {
            // modeler no listo aún
          }
        }
      }
    })

    observer.observe(document.documentElement, { attributes: true })

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      window.removeEventListener('contextmenu', handleContextMenu, true)
      window.removeEventListener('focus', handleFocus, true)
      observer.disconnect()
      modeler.destroy()
      modelerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef])

  const importXml = useCallback(async (xml: string, diagramId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = modelerRef.current as any
    if (!modeler) return
    // Fencing token: mientras esta importación está en curso, canvasSession
    // reporta "ningún diagrama confirmado" — cualquier sistema (colaboración,
    // guardado) que consulte isCanvasReadyFor() sabe que el canvas está en
    // transición y debe esperar, en vez de asumir que el contenido actual
    // (todavía el diagrama anterior) ya pertenece al nuevo.
    const token = beginImport()
    try {
      await modeler.importXML(xml)
    } catch (err) {
      if (modelerRef.current !== modeler) return
      throw err
    }
    if (modelerRef.current !== modeler) return
    // Serialización canónica (ADR §6.4): bpmn-js preserva el dialecto del XML
    // importado al hacer saveXML. Forzar el prefijo bpmn: una vez aquí hace
    // que TODO guardado posterior (autosave incluido) salga canónico — los
    // diagramas legacy "sin prefijo" migran solos en su próximo guardado.
    try { forceCanonicalBpmnPrefix(modeler.getDefinitions()) } catch { /* noop */ }
    // Si mientras tanto se lanzó OTRA importación (cambio de pestaña más
    // rápido que esta), completeImport descarta este resultado en silencio.
    completeImport(token, diagramId)
    try {
      modeler.get('canvas').zoom('fit-viewport', 'all')
    } catch {
      // empty canvas — nothing to fit
    }
  }, [])

  const exportXml = useCallback(async (): Promise<string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = modelerRef.current as any
    if (!modeler) throw new Error('Modeler not initialized')
    const { xml } = await modeler.saveXML({ format: true })
    return xml as string
  }, [])

  const exportSvg = useCallback(async (): Promise<string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = modelerRef.current as any
    if (!modeler) throw new Error('Modeler not initialized')
    const { svg } = await modeler.saveSVG()
    return svg as string
  }, [])

  const undo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(modelerRef.current as any)?.get('commandStack').undo()
  }, [])

  const redo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(modelerRef.current as any)?.get('commandStack').redo()
  }, [])

  const zoom = useCallback((level: number | 'fit-viewport') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(modelerRef.current as any)?.get('canvas').zoom(level, 'all')
  }, [])

  const fitToScreen = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(modelerRef.current as any)?.get('canvas').zoom('fit-viewport', 'all')
  }, [])

  const getElementRegistry = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (modelerRef.current as any)?.get('elementRegistry')
  }, [])

  const getSelectedElements = useCallback((): {
    id: string
    businessObject: { name?: string; $type: string }
  }[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selection = (modelerRef.current as any)?.get('selection')
    return selection?.get() ?? []
  }, [])

  const canUndo = useCallback((): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (modelerRef.current as any)?.get('commandStack').canUndo() ?? false
  }, [])

  const canRedo = useCallback((): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (modelerRef.current as any)?.get('commandStack').canRedo() ?? false
  }, [])

  const scrollToElement = useCallback((elementId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = modelerRef.current as any
    if (!modeler) return
    const registry = modeler.get('elementRegistry')
    const el = registry.get(elementId)
    if (!el) return
    modeler.get('selection').select(el)
    modeler.get('canvas').scrollToElement(el)
  }, [])

  const updateElementProperty = useCallback((elementId: string, property: string, value: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = modelerRef.current as any
    if (!modeler) return
    const registry = modeler.get('elementRegistry')
    const el = registry.get(elementId)
    if (!el) return
    // Fase: nombre y color se guardan en extensiones moddle (flujo:phaseName /
    // flujo:phaseColor), no en bo.name. Persistir vía updateProperties para que
    // entre en el stack (undo + autosave + CRDT) y re-renderice.
    if (isPhase(el)) {
      if (property === 'name') {
        setPhaseName(el, value)
        modeler.get('modeling').updateProperties(el, { phaseName: value, name: value })
        return
      }
      if (property === 'phaseColor') {
        setPhaseColor(el, value)
        modeler.get('modeling').updateProperties(el, { phaseColor: value })
        return
      }
    }
    modeler.get('modeling').updateProperties(el, { [property]: value })
  }, [])

  const startCreate = useCallback((elementType: string, event: MouseEvent) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = modelerRef.current as any
    if (!m) return
    try {
      const elDef = BPMN_ELEMENTS.find((e) => e.type === elementType)
      const bpmnType = elDef?.bpmnType ?? elementType
      const eventDefinitionType = elDef?.eventDefinitionType

      if (elDef?.category === 'connections') {
        m.get('globalConnect').start(event)
        return
      }

      let shape
      if (bpmnType === 'bpmn:Participant') {
         
        const processBO = m.get('bpmnFactory').create('bpmn:Process', { isExecutable: false })
        shape = m.get('elementFactory').createShape({
          type: 'bpmn:Participant',
          processRef: processBO,
          isExpanded: true,
        })
        m.get('create').start(event, shape)
      } else if (elementType === 'image') {
        const bo = m.get('bpmnFactory').create('bpmn:TextAnnotation', {
          text: '[IMAGE_PENDING]'
        })
        shape = m.get('elementFactory').createShape({ type: 'bpmn:TextAnnotation', businessObject: bo })
        m.get('create').start(event, shape)
      } else if (elementType === 'phase') {
        // Fase: divisor vertical. Group con id marcado 'Phase_*' (ver phaseUtil).
        const id = `${PHASE_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bo = m.get('bpmnFactory').create('bpmn:Group') as any
        bo.id = id
        // El nombre ("Fase N") y el color los asigna PhaseModule al anclar la fase
        // (necesita conocer el pool y cuántas fases ya existen).
        shape = m.get('elementFactory').createShape({
          id,
          type: 'bpmn:Group',
          businessObject: bo,
          width: ELEMENT_SIZES.phase.width,
          height: ELEMENT_SIZES.phase.height,
        })
        m.get('create').start(event, shape)
      } else if (eventDefinitionType) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eventDef = m.get('bpmnFactory').create(eventDefinitionType) as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bo = m.get('bpmnFactory').create(bpmnType, { eventDefinitions: [eventDef] }) as any
        eventDef.$parent = bo
        shape = m.get('elementFactory').createShape({ type: bpmnType, businessObject: bo })
        m.get('create').start(event, shape)
      } else {
        shape = m.get('elementFactory').createShape({ type: bpmnType })
        m.get('create').start(event, shape)
      }
    } catch {
      // modeler not ready or invalid type
    }
  }, [])

  // ── Enlace de subprocesos a otros diagramas ──
  const getLinkedDiagram = useCallback((elementId: string): string | null => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = modelerRef.current as any
    const el = m?.get('elementRegistry').get(elementId)
    return el ? readLink(el) : null
  }, [])

  const setLinkedDiagram = useCallback((elementId: string, diagramId: string | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = modelerRef.current as any
    const el = m?.get('elementRegistry').get(elementId)
    if (el) writeLink(m.get('modeling'), el, diagramId)
  }, [])

  return {
    modelerRef,
    importXml,
    exportXml,
    exportSvg,
    undo,
    redo,
    zoom,
    fitToScreen,
    getElementRegistry,
    getSelectedElements,
    canUndo,
    canRedo,
    scrollToElement,
    updateElementProperty,
    startCreate,
    getLinkedDiagram,
    setLinkedDiagram,
  }
}