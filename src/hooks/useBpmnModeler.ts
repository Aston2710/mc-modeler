import { useEffect, useRef, useCallback } from 'react'
// bpmn-js ships CommonJS with incomplete types — cast throughout via any
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { useUIStore } from '@/store/uiStore'
import { MODELER_CONFIG } from '@/bpmn/config'
import { BPMN_ELEMENTS } from '@/domain/bpmnElements'


interface UseBpmnModelerOptions {
  onReady?: () => void
  onChanged?: () => void
  onSelectionChange?: (ids: string[]) => void
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
  onReadyRef.current = options.onReady
  onChangedRef.current = options.onChanged
  onSelectionChangeRef.current = options.onSelectionChange

  useEffect(() => {
    if (!containerRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = new BpmnModeler({ container: containerRef.current, ...MODELER_CONFIG }) as any
    modelerRef.current = modeler

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

    // Signal that the modeler is ready — callers can now safely call importXml
    onReadyRef.current?.()

    // ── MutationObserver: re-render cuando cambia el tema (data-theme) ──────
    // Cuando el usuario alterna entre modo claro y oscuro, el ThemeAwareRenderer
    // necesita volver a pintar todos los elementos con los nuevos colores CSS.
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
            // Re-renderizar cada elemento del canvas
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
      observer.disconnect()
      modeler.destroy()
      modelerRef.current = null
    }
  // containerRef is a stable ref — intentional single-run
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef])

  const importXml = useCallback(async (xml: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modeler = modelerRef.current as any
    if (!modeler) return
    try {
      await modeler.importXML(xml)
    } catch (err) {
      // If this modeler was destroyed mid-import (React StrictMode double-invoke),
      // discard silently — the second invocation will succeed.
      if (modelerRef.current !== modeler) return
      throw err
    }
    // Guard again: cleanup may have run while importXML was awaiting
    if (modelerRef.current !== modeler) return
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
    modeler.get('modeling').updateProperties(el, { [property]: value })
  }, [])

  // Starts bpmn-js native drag-create from a palette mousedown.
  // Accepts domain element type (e.g. 'startTimerEvent') or legacy bpmnType.
  const startCreate = useCallback((elementType: string, event: MouseEvent) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = modelerRef.current as any
    if (!m) return
    try {
      // Resolve from domain type → bpmnType + optional event definition
      const elDef = BPMN_ELEMENTS.find((e) => e.type === elementType)
      const bpmnType = elDef?.bpmnType ?? elementType
      const eventDefinitionType = elDef?.eventDefinitionType

      // Connections: activate global connect tool (click source → drag to target)
      if (elDef?.category === 'connections') {
        m.get('globalConnect').start(event)
        return
      }

      let shape
      if (bpmnType === 'bpmn:Participant') {
        // bpmn-js degrades a Participant to a "black-box pool" when its
        // businessObject has no processRef. We must create the Process
        // explicitly via bpmnFactory and bind it before create.start(),
        // then force rootElementRequired so the drop target is always the
        // Collaboration root — not an existing Participant.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processBO = m.get('bpmnFactory').create('bpmn:Process', { isExecutable: false })
        shape = m.get('elementFactory').createShape({
          type: 'bpmn:Participant',
          processRef: processBO,
          isExpanded: true,
        })
        m.get('create').start(event, shape, { hints: { rootElementRequired: true } })
      } else if (eventDefinitionType) {
        // Event with marker (timer, message, signal, etc.) — attach event definition
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
  }
}
