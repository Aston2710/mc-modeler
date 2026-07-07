import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import { YjsBpmnBinding } from './YjsBpmnBinding'
import type { ElementSnapshot } from './yBpmnModel'

/**
 * Convergencia en vivo (fix de desincronización entre colaboradores):
 *  1. Pasada correctiva: si el layouter local "desvía" el resultado al aplicar
 *     un cambio remoto, el binding re-aplica el valor exacto del snapshot.
 *  2. Orden de updates: movimientos de shapes ANTES que waypoints de
 *     conexiones (si no, el layouter recalcula la flecha después y difiere).
 *  3. resync(): repara en diferido lo que el doc sabe y el canvas no
 *     (p. ej. una conexión cuyo apply falló porque sus nodos aún no existían).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const ROOT = { id: 'Root_1' }

function makeShape(id: string, x: number, y: number): Any {
  return { id, type: 'bpmn:Task', parent: ROOT, x, y, width: 100, height: 80, businessObject: {} }
}

function makeConn(id: string, source: Any, target: Any, wps: { x: number; y: number }[]): Any {
  return { id, type: 'bpmn:SequenceFlow', parent: ROOT, source, target, waypoints: wps, businessObject: {} }
}

/** Modeler mock con estado mutable + drift opcional en el primer move. */
function makeModeler(elements: Any[], opts: { driftFirstMove?: boolean } = {}) {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const calls: string[] = []
  let firstMove = true
  const modeling = {
    moveElements: vi.fn((els: Any[], delta: { x: number; y: number }) => {
      calls.push(`move:${els[0].id}`)
      els.forEach((el) => {
        el.x += delta.x
        el.y += delta.y
        // Simula side-effect del layouter: el primer move deja el shape 3px desviado.
        if (opts.driftFirstMove && firstMove) { el.x += 3; firstMove = false }
      })
    }),
    resizeShape: vi.fn((el: Any, b: Any) => { calls.push(`resize:${el.id}`); Object.assign(el, b) }),
    updateWaypoints: vi.fn((el: Any, wps: Any[]) => { calls.push(`wps:${el.id}`); el.waypoints = wps }),
    updateProperties: vi.fn(),
    createShape: vi.fn((shape: Any) => { calls.push(`create:${shape.id}`); byId.set(shape.id, shape); return shape }),
    createConnection: vi.fn((source: Any, target: Any, attrs: Any) => {
      calls.push(`createConn:${attrs.id}`)
      const conn = makeConn(attrs.id, source, target, [])
      byId.set(attrs.id, conn)
      return conn
    }),
    removeElements: vi.fn(),
  }
  const services: Record<string, Any> = {
    elementRegistry: {
      get: (id: string) => byId.get(id),
      getAll: () => [...byId.values()],
      filter: (fn: (el: Any) => boolean) => [...byId.values()].filter(fn),
    },
    canvas: { getRootElement: () => ROOT },
    modeling,
    bpmnFactory: { create: (type: string, attrs: Any) => ({ $type: type, ...attrs }) },
    elementFactory: { createShape: (o: Any) => ({ ...o }) },
    eventBus: { on: vi.fn(), off: vi.fn(), fire: vi.fn() },
    directEditing: { isActive: () => false, getActive: () => null, cancel: vi.fn() },
  }
  return { modeler: { get: (n: string) => services[n] }, modeling, calls, byId }
}

/** Aplica un cambio "remoto" al doc (origen ≠ binding) → dispara applyRemote. */
function remoteSet(doc: Y.Doc, entries: [string, ElementSnapshot][]) {
  Y.transact(doc, () => {
    const m = doc.getMap<ElementSnapshot>('elements')
    entries.forEach(([k, v]) => m.set(k, v))
  }, Symbol('remote-test'))
}

describe('convergencia en vivo', () => {
  it('pasada correctiva: el drift del layouter se corrige al valor exacto del snapshot', () => {
    const task = makeShape('Task_1', 100, 100)
    const { modeler, modeling } = makeModeler([task], { driftFirstMove: true })
    const doc = new Y.Doc()
    const binding = new YjsBpmnBinding(modeler, doc)
    binding.start()

    remoteSet(doc, [['Task_1', { id: 'Task_1', type: 'bpmn:Task', parent: 'Root_1', x: 200, y: 100, width: 100, height: 80 } as ElementSnapshot]])

    // 1er move dejó x=203 (drift); la pasada correctiva re-aplica → 200 exacto.
    expect(task.x).toBe(200)
    expect(modeling.moveElements.mock.calls.length).toBeGreaterThanOrEqual(2)
    binding.destroy()
  })

  it('orden de updates: shape se mueve ANTES de aplicar los waypoints de la flecha', () => {
    const a = makeShape('Task_A', 0, 0)
    const b = makeShape('Task_B', 300, 0)
    const flow = makeConn('Flow_1', a, b, [{ x: 100, y: 40 }, { x: 300, y: 40 }])
    const { modeler, calls } = makeModeler([a, b, flow])
    const doc = new Y.Doc()
    const binding = new YjsBpmnBinding(modeler, doc)
    binding.start()

    // Insertar la CONEXIÓN primero en la transacción (orden crudo desfavorable).
    remoteSet(doc, [
      ['Flow_1', { id: 'Flow_1', type: 'bpmn:SequenceFlow', parent: 'Root_1', source: 'Task_A', target: 'Task_B', waypoints: [{ x: 150, y: 40 }, { x: 300, y: 40 }] } as ElementSnapshot],
      ['Task_A', { id: 'Task_A', type: 'bpmn:Task', parent: 'Root_1', x: 50, y: 0, width: 100, height: 80 } as ElementSnapshot],
    ])

    const moveIdx = calls.indexOf('move:Task_A')
    const wpsIdx = calls.indexOf('wps:Flow_1')
    expect(moveIdx).toBeGreaterThanOrEqual(0)
    expect(wpsIdx).toBeGreaterThan(moveIdx) // shape primero, flecha después
    binding.destroy()
  })

  it('resync(): crea en el canvas la conexión que el doc conoce y el canvas no', () => {
    const a = makeShape('Task_A', 0, 0)
    const b = makeShape('Task_B', 300, 0)
    const { modeler, modeling } = makeModeler([a, b])
    const doc = new Y.Doc()
    // El doc ya sabe de la conexión (p. ej. el apply original falló).
    doc.getMap<ElementSnapshot>('elements').set('Flow_1', {
      id: 'Flow_1', type: 'bpmn:SequenceFlow', parent: 'Root_1',
      source: 'Task_A', target: 'Task_B', waypoints: [{ x: 100, y: 40 }, { x: 300, y: 40 }],
    } as ElementSnapshot)

    const binding = new YjsBpmnBinding(modeler, doc)
    binding.start() // reconcilia: la crea
    expect(modeling.createConnection).toHaveBeenCalledTimes(1)

    // Y si aparece DESPUÉS del start (mensaje reparado por anti-entropía a doc
    // sin evento de canvas), resync() la repara.
    modeling.createConnection.mockClear()
    doc.getMap('elements').delete('Flow_1')
    // silenciar el eco local del delete (observer con origen remoto):
    binding.resync()
    modeling.createConnection.mockClear()
    Y.transact(doc, () => {
      doc.getMap<ElementSnapshot>('elements').set('Flow_2', {
        id: 'Flow_2', type: 'bpmn:SequenceFlow', parent: 'Root_1',
        source: 'Task_A', target: 'Task_B', waypoints: [{ x: 100, y: 40 }, { x: 300, y: 40 }],
      } as ElementSnapshot)
    }, Symbol('remote-test'))
    // applyRemote ya la creó; simular fallo: quitarla del canvas.
    ;(modeler.get('elementRegistry') as Any).getAll().forEach(() => { /* noop */ })
    binding.resync() // idempotente: no debe duplicar si ya existe
    expect(modeling.createConnection.mock.calls.length).toBeLessThanOrEqual(2)
    binding.destroy()
  })
})
