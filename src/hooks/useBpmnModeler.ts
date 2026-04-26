import { useEffect, useRef, useCallback } from 'react'
// bpmn-js ships CommonJS with incomplete types — cast throughout via any
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { useUIStore } from '@/store/uiStore'
import { MODELER_CONFIG } from '@/bpmn/config'

// CSS imported as side-effects — declared as modules in vite-env.d.ts
// @ts-ignore
import 'bpmn-js/dist/assets/bpmn-js.css'
// @ts-ignore
import 'bpmn-js/dist/assets/diagram-js.css'
// @ts-ignore
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'

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

    return () => {
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
  // Ghost shape follows cursor; releasing over canvas places the element.
  const startCreate = useCallback((bpmnType: string, event: MouseEvent) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = modelerRef.current as any
    if (!m) return
    try {
      const shape = m.get('elementFactory').createShape({ type: bpmnType })
      m.get('create').start(event, shape)
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
