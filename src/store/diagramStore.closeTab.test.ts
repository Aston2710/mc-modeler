/**
 * PLAN-005 paso 6 — cerrar una pestaña libera su instancia de bpmn-js.
 *
 * Antes, `closeTab` solo quitaba la pestaña del array. La instancia seguía en
 * `modelerCache` con su SVG, su element registry y su pila de undo, hasta que
 * el LRU la desalojara (tope 6) o se volviera al inicio (`disposeAll`). Fuga
 * acotada pero real: abrir y cerrar 6 diagramas grandes mantenía los 6 vivos.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// bpmn-js no arranca en jsdom: se simula el cache para observar las llamadas.
const disposed: string[] = []
vi.mock('@/bpmn/modelerCache', () => ({
  dispose: (id: string) => { disposed.push(id) },
}))

vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }))

import { useDiagramStore } from './diagramStore'

beforeEach(() => {
  disposed.length = 0
  useDiagramStore.setState({
    tabs: [
      { id: 'a', name: 'A', dirty: false },
      { id: 'b', name: 'B', dirty: false },
      { id: 'c', name: 'C', dirty: false },
    ],
    activeTabId: 'b',
  })
})

describe('closeTab libera la instancia (PLAN-005 paso 6)', () => {
  it('destruye la instancia de la pestaña cerrada', () => {
    useDiagramStore.getState().closeTab('a')
    expect(disposed).toEqual(['a'])
  })

  it('no toca las instancias de las demás pestañas', () => {
    useDiagramStore.getState().closeTab('a')
    expect(disposed).not.toContain('b')
    expect(disposed).not.toContain('c')
    expect(useDiagramStore.getState().tabs.map((t) => t.id)).toEqual(['b', 'c'])
  })

  it('al cerrar la pestaña activa, primero mueve el foco y luego destruye', () => {
    // El orden importa: si se destruyera antes de reasignar activeTabId, el
    // canvas se quedaría un instante apuntando a una instancia muerta.
    useDiagramStore.getState().closeTab('b')

    expect(useDiagramStore.getState().activeTabId).toBe('a')
    expect(disposed).toEqual(['b'])
  })

  it('cerrar la última pestaña deja activeTabId en null y libera igual', () => {
    useDiagramStore.setState({ tabs: [{ id: 'solo', name: 'Solo', dirty: false }], activeTabId: 'solo' })

    useDiagramStore.getState().closeTab('solo')

    expect(useDiagramStore.getState().tabs).toEqual([])
    expect(useDiagramStore.getState().activeTabId).toBe(null)
    expect(disposed).toEqual(['solo'])
  })

  it('abrir y cerrar seis diagramas no deja ninguna instancia viva', () => {
    // El escenario de la fuga: con el tope LRU en 6, sin `dispose` las seis
    // sobrevivían al cierre.
    const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']
    useDiagramStore.setState({
      tabs: ids.map((id) => ({ id, name: id, dirty: false })),
      activeTabId: 'd1',
    })

    for (const id of ids) useDiagramStore.getState().closeTab(id)

    expect(disposed).toEqual(ids)
    expect(useDiagramStore.getState().tabs).toEqual([])
  })
})
