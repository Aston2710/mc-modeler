import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as Y from 'yjs'
import { YjsBpmnBinding } from './YjsBpmnBinding'
import type { ElementSnapshot } from './yBpmnModel'

/**
 * Pivote ADR (Etapa 2): Yjs es SOLO transporte de sesión — el doc nace vacío,
 * no se carga ni se persiste estado Yjs. Estos tests fijan esa semántica:
 *  1. Tripwire: useCollab NO importa yjsPersistence (ni carga ni append).
 *  2. Doc vacío al arrancar el binding → baseline puro, cero escrituras al doc.
 *  3. Late-join: los diffs de sesión de un peer se aplican; lo ya reflejado
 *     en el canvas (mismo snapshot) es no-op.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const HERE = dirname(fileURLToPath(import.meta.url))

function makeModeler(opts: { rootId: string; canvasElements: Any[] }) {
  const createShape = vi.fn((shape: Any) => shape)
  const root = { id: opts.rootId }
  const byId = new Map(opts.canvasElements.map((e) => [e.id, e]))
  const registry = {
    get: (id: string) => byId.get(id),
    getAll: () => opts.canvasElements,
    filter: (fn: (el: Any) => boolean) => opts.canvasElements.filter(fn),
  }
  const services: Record<string, Any> = {
    elementRegistry: registry,
    canvas: { getRootElement: () => root },
    modeling: { createShape, createConnection: vi.fn(), moveElements: vi.fn(), resizeShape: vi.fn(), updateProperties: vi.fn(), updateWaypoints: vi.fn() },
    bpmnFactory: { create: (type: string, attrs: Any) => ({ $type: type, ...attrs }) },
    elementFactory: { createShape: (o: Any) => ({ ...o }) },
    eventBus: { on: vi.fn(), off: vi.fn(), fire: vi.fn() },
    directEditing: { isActive: () => false, getActive: () => null, cancel: vi.fn() },
  }
  return { modeler: { get: (name: string) => services[name] }, createShape }
}

describe('pivote: Yjs solo-transporte de sesión', () => {
  it('tripwire: useCollab no importa yjsPersistence (no carga ni persiste Yjs)', () => {
    const src = readFileSync(join(HERE, '..', 'hooks', 'useCollab.ts'), 'utf8')
    expect(src).not.toContain('yjsPersistence')
    expect(src).not.toContain('loadYjsState')
    expect(src).not.toContain('appendYjsUpdate')
  })

  it('doc vacío al arrancar → baseline puro: ni escrituras al doc ni al canvas', () => {
    // Canvas ya poblado desde current_xml (única verdad).
    const task = { id: 'Task_1', type: 'bpmn:Task', x: 10, y: 10, width: 100, height: 80, businessObject: { name: 'A' } }
    const { modeler, createShape } = makeModeler({ rootId: 'Root_1', canvasElements: [task] })
    const doc = new Y.Doc()
    const writes: unknown[] = []
    doc.on('update', (u: Uint8Array) => writes.push(u))

    const binding = new YjsBpmnBinding(modeler, doc)
    binding.start() // ymap.size === 0 → rama baseline

    expect(doc.getMap('elements').size).toBe(0) // nada sembrado
    expect(writes).toHaveLength(0)              // cero updates emitidos
    expect(createShape).not.toHaveBeenCalled()  // canvas intacto
    binding.destroy()
  })

  it('late-join: diffs de sesión del peer se aplican sobre el canvas del XML', () => {
    // Peer editó durante la sesión: creó Task_2. El late-joiner ya tiene Task_1
    // (vino en su current_xml); solo debe crearse Task_2.
    const task1 = { id: 'Task_1', type: 'bpmn:Task', x: 10, y: 10, width: 100, height: 80, businessObject: { name: 'A' } }
    const { modeler, createShape } = makeModeler({ rootId: 'Root_1', canvasElements: [task1] })

    // Doc del late-joiner tras aplicar el estado del peer (handshake onJoin).
    const peerDoc = new Y.Doc()
    peerDoc.getMap<ElementSnapshot>('elements').set('Task_2', {
      id: 'Task_2', type: 'bpmn:Task', parent: 'Root_1', x: 200, y: 10, width: 100, height: 80,
    } as ElementSnapshot)
    const joinerDoc = new Y.Doc()
    Y.applyUpdate(joinerDoc, Y.encodeStateAsUpdate(peerDoc))

    const binding = new YjsBpmnBinding(modeler, joinerDoc)
    binding.start() // ymap.size > 0 → reconcileCanvasToDoc

    const createdIds = createShape.mock.calls.map((c) => c[0]?.id)
    expect(createdIds).toContain('Task_2')      // lo nuevo del peer se dibuja
    expect(createdIds).not.toContain('Task_1')  // lo que ya estaba, no se duplica
    binding.destroy()
  })
})
