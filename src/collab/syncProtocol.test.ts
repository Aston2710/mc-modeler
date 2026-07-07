import { describe, it, expect, vi, afterEach } from 'vitest'
import * as Y from 'yjs'
import { createBroadcastCoalescer, encodeOwnStateVector, diffForPeer } from './syncProtocol'

afterEach(() => vi.useRealTimers())

describe('createBroadcastCoalescer', () => {
  it('fusiona los deltas de la ventana en UN solo mensaje', () => {
    vi.useFakeTimers()
    const sent: Uint8Array[] = []
    const c = createBroadcastCoalescer((m) => sent.push(m), 150)

    // Dos docs para generar updates reales fusionables.
    const src = new Y.Doc()
    const updates: Uint8Array[] = []
    src.on('update', (u: Uint8Array) => updates.push(u))
    src.getMap('elements').set('a', { id: 'a' })
    src.getMap('elements').set('b', { id: 'b' })
    src.getMap('elements').set('c', { id: 'c' })
    updates.forEach((u) => c.push(u))

    expect(sent).toHaveLength(0) // aún en ventana
    vi.advanceTimersByTime(160)
    expect(sent).toHaveLength(1) // un solo broadcast

    // El mensaje fusionado reconstruye TODO en un receptor.
    const dst = new Y.Doc()
    Y.applyUpdate(dst, sent[0])
    expect(dst.getMap('elements').size).toBe(3)
    c.dispose()
  })

  it('dispose() vuelca lo pendiente (últimos ms de edición no se pierden)', () => {
    vi.useFakeTimers()
    const sent: Uint8Array[] = []
    const c = createBroadcastCoalescer((m) => sent.push(m), 150)
    const src = new Y.Doc()
    src.on('update', (u: Uint8Array) => c.push(u))
    src.getMap('elements').set('a', { id: 'a' })
    c.dispose() // sin esperar la ventana
    expect(sent).toHaveLength(1)
  })
})

describe('anti-entropía por state vector', () => {
  it('mensaje perdido → el peer responde el diff exacto y los docs convergen', () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()

    // A hace 2 cambios; B solo recibe el primero (el segundo "se pierde").
    const updates: Uint8Array[] = []
    docA.on('update', (u: Uint8Array) => updates.push(u))
    docA.getMap('elements').set('Task_1', { id: 'Task_1', x: 100 })
    docA.getMap('elements').set('Task_2', { id: 'Task_2', x: 200 })
    Y.applyUpdate(docB, updates[0]) // updates[1] perdido

    expect(docB.getMap('elements').size).toBe(1) // divergentes

    // B publica su state vector; A calcula lo que le falta.
    const diff = diffForPeer(docA, encodeOwnStateVector(docB))
    expect(diff).not.toBeNull()
    Y.applyUpdate(docB, diff!)
    expect(docB.getMap('elements').size).toBe(2) // convergieron
  })

  it('docs iguales → sin diff (no hay eco infinito)', () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    docA.getMap('elements').set('a', { id: 'a' })
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
    expect(diffForPeer(docA, encodeOwnStateVector(docB))).toBeNull()
  })

  it('state vector corrupto → null, no explota', () => {
    const doc = new Y.Doc()
    expect(diffForPeer(doc, new Uint8Array([255, 254, 253]))).toBeNull()
  })
})
