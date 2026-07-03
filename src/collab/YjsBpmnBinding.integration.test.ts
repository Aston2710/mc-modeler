import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import { YjsBpmnBinding } from './YjsBpmnBinding'
import type { ElementSnapshot } from './yBpmnModel'

/**
 * Test de integración del CANDADO en el camino real del binding.
 * Simula un modeler bpmn-js mínimo y verifica que reconcileCanvasToDoc (vía start())
 * NO dibuja una pool ajena (parent = raíz de otro diagrama) cuando el canvas ya
 * tiene su pool propia, y SÍ dibuja la pool propia cuando el XML es solo-proceso.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

function makeModeler(opts: {
  rootId: string
  registryElements: Any[]        // lo que getAll() devuelve (vista del canvas)
  resolvableIds: string[]        // ids que registry.get() resuelve
}) {
  const createShape = vi.fn((shape: Any) => shape)
  const createConnection = vi.fn((_s: Any, _t: Any, attrs: Any) => ({ id: attrs.id }))
  const root = { id: opts.rootId }
  const registry = {
    get: (id: string) => (opts.resolvableIds.includes(id) ? { id } : undefined),
    getAll: () => opts.registryElements,
    filter: (fn: (el: Any) => boolean) => opts.registryElements.filter(fn),
  }
  const services: Record<string, Any> = {
    elementRegistry: registry,
    canvas: { getRootElement: () => root },
    modeling: { createShape, createConnection, moveElements: vi.fn(), resizeShape: vi.fn(), updateProperties: vi.fn(), updateWaypoints: vi.fn() },
    bpmnFactory: { create: (type: string, attrs: Any) => ({ $type: type, ...attrs }) },
    elementFactory: { createShape: (o: Any) => ({ ...o }) },
    eventBus: { on: vi.fn(), off: vi.fn(), fire: vi.fn() },
    directEditing: { isActive: () => false, getActive: () => null, cancel: vi.fn() },
  }
  const modeler = { get: (name: string) => services[name] }
  return { modeler, createShape, createConnection }
}

const foreignPool = (): ElementSnapshot => ({
  id: 'Part_FOREIGN', type: 'bpmn:Participant', parent: 'Collab_FOREIGN',
  name: 'Pool de OTRO diagrama', x: 100, y: 100, width: 600, height: 300,
} as ElementSnapshot)

const foreignLane = (): ElementSnapshot => ({
  id: 'Lane_FOREIGN', type: 'bpmn:Lane', parent: 'Part_FOREIGN',
  name: 'Lane ajena', x: 130, y: 100, width: 570, height: 150,
} as ElementSnapshot)

describe('candado en el camino real del binding (reconcileCanvasToDoc)', () => {
  it('CONTAMINACIÓN: no dibuja la pool ajena ni su lane cuando el canvas ya tiene pool propia', () => {
    // Canvas ya muestra la pool propia del diagrama.
    const ownPool = { id: 'Part_OWN', type: 'bpmn:Participant' }
    const { modeler, createShape } = makeModeler({
      rootId: 'Collaboration_OWN',
      registryElements: [ownPool],           // filter(Participant) → [ownPool] → canvasHasParticipants = true
      resolvableIds: ['Collaboration_OWN'],  // la raíz propia resuelve; Collab_FOREIGN NO
    })
    const doc = new Y.Doc()
    const ymap = doc.getMap<ElementSnapshot>('elements')
    ymap.set('Part_FOREIGN', foreignPool())
    ymap.set('Lane_FOREIGN', foreignLane())

    const binding = new YjsBpmnBinding(modeler, doc)
    binding.start()   // ymap.size>0 → reconcileCanvasToDoc

    // La pool ajena y su lane NO deben crearse en el canvas.
    const createdIds = createShape.mock.calls.map((c) => c[0]?.id)
    expect(createdIds).not.toContain('Part_FOREIGN')
    expect(createdIds).not.toContain('Lane_FOREIGN')
    expect(createShape).not.toHaveBeenCalled()
    binding.destroy()
  })

  it('BENIGNO: SÍ dibuja la pool propia cuando el XML es solo-proceso (canvas sin pools)', () => {
    // Canvas solo-proceso: raíz Process, sin participantes.
    const { modeler, createShape } = makeModeler({
      rootId: 'Process_OWN',
      registryElements: [],                  // filter(Participant) → [] → canvasHasParticipants = false
      resolvableIds: [],                     // el parent de la pool no resuelve (vive en Yjs)
    })
    const doc = new Y.Doc()
    const ymap = doc.getMap<ElementSnapshot>('elements')
    ymap.set('Part_OWN', {
      id: 'Part_OWN', type: 'bpmn:Participant', parent: 'Collaboration_OWN',
      name: 'Pool propia (solo en Yjs)', x: 80, y: 80, width: 600, height: 300,
    } as ElementSnapshot)

    const binding = new YjsBpmnBinding(modeler, doc)
    binding.start()

    const createdIds = createShape.mock.calls.map((c) => c[0]?.id)
    expect(createdIds).toContain('Part_OWN')   // la pool propia SÍ se crea
    binding.destroy()
  })
})
