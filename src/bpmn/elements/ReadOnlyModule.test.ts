import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ReadOnlyModuleDefault from './ReadOnlyModule'
import { setBpmnReadOnly, isBpmnReadOnly } from '@/bpmn/readOnlyState'

// El módulo exporta { __init__, readOnlyGuard: ['type', Fn], readOnlyContextPadProvider: ['type', Fn] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod = ReadOnlyModuleDefault as any
const ReadOnlyGuard = mod.readOnlyGuard[1]
const ReadOnlyContextPadProvider = mod.readOnlyContextPadProvider[1]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

/**
 * eventBus falso que captura los handlers registrados por prioridad, para
 * invocarlos igual que lo haría diagram-js. Contrato verificado en fuente:
 * Rules.allowed() → commandStack.canExecute() → eventBus.fire('commandStack.canExecute');
 * si un handler devuelve false, fire() devuelve false y canExecute → false
 * (node_modules/diagram-js/lib/features/rules/Rules.js + command/CommandStack.js).
 */
function makeFakeEventBus() {
  const handlers: Record<string, ((e?: AnyObj) => unknown)[]> = {}
  return {
    on(event: string | string[], _priority: number, fn: (e?: AnyObj) => unknown) {
      const names = Array.isArray(event) ? event : [event]
      for (const n of names) (handlers[n] ??= []).push(fn)
    },
    /** Invoca el primer handler registrado para `event` (el nuestro es único por evento). */
    invoke(event: string, e?: AnyObj) {
      return handlers[event]?.[0]?.(e)
    },
    has(event: string) {
      return !!handlers[event]?.length
    },
  }
}

beforeEach(() => setBpmnReadOnly(false))
afterEach(() => setBpmnReadOnly(false))

describe('ReadOnlyGuard (vetos)', () => {
  it('veta commandStack.canExecute solo en solo-lectura', () => {
    const bus = makeFakeEventBus()
    const contextPad = { close: vi.fn() }
    const directEditing = { cancel: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (ReadOnlyGuard as any)(bus, contextPad, directEditing)

    setBpmnReadOnly(false)
    expect(bus.invoke('commandStack.canExecute')).toBeUndefined() // no interfiere

    setBpmnReadOnly(true)
    expect(bus.invoke('commandStack.canExecute')).toBe(false) // bloquea toda mutación con reglas
  })

  it('veta doble-clic (edición de etiqueta) y pegado en solo-lectura', () => {
    const bus = makeFakeEventBus()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (ReadOnlyGuard as any)(bus, { close: vi.fn() }, { cancel: vi.fn() })

    setBpmnReadOnly(true)
    expect(bus.invoke('element.dblclick')).toBe(false)
    expect(bus.invoke('copyPaste.pasteElements')).toBe(false)

    setBpmnReadOnly(false)
    expect(bus.invoke('element.dblclick')).toBeUndefined()
    expect(bus.invoke('copyPaste.pasteElements')).toBeUndefined()
  })

  it('veta el inicio de arrastres que mutan (mover/resize/conectar/bendpoint)', () => {
    const bus = makeFakeEventBus()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (ReadOnlyGuard as any)(bus, { close: vi.fn() }, { cancel: vi.fn() })

    const dragEvents = [
      'shape.move.start', 'elements.move', 'resize.start', 'connect.start',
      'global-connect.start', 'bendpoint.move.start', 'connectionSegment.move.start',
      'spaceTool.selection.start', 'spaceTool.move',
    ]

    setBpmnReadOnly(true)
    for (const ev of dragEvents) expect(bus.invoke(ev), ev).toBe(false)

    setBpmnReadOnly(false)
    for (const ev of dragEvents) expect(bus.invoke(ev), ev).toBeUndefined()
  })

  it('veta teclas mutantes (flechas/borrar/undo/pegar) en el teclado de bpmn-js', () => {
    const bus = makeFakeEventBus()
    let kbHandler: ((e: AnyObj) => unknown) | null = null
    const keyboard = { addListener: (_p: number, fn: (e: AnyObj) => unknown) => { kbHandler = fn } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (ReadOnlyGuard as any)(bus, { close: vi.fn() }, { cancel: vi.fn() }, keyboard)
    expect(kbHandler).toBeTypeOf('function')

    const fire = (init: Partial<KeyboardEvent>) => {
      const preventDefault = vi.fn()
      const res = kbHandler!({ keyEvent: { preventDefault, ...init } })
      return { res, preventDefault }
    }

    setBpmnReadOnly(true)
    // Mutantes → bloqueadas (return false + preventDefault).
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace']) {
      const { res, preventDefault } = fire({ key })
      expect(res, key).toBe(false)
      expect(preventDefault, key).toHaveBeenCalled()
    }
    expect(fire({ key: 'z', ctrlKey: true }).res).toBe(false) // undo
    expect(fire({ key: 'v', ctrlKey: true }).res).toBe(false) // pegar

    // No mutantes → permitidas (undefined, sin preventDefault).
    expect(fire({ key: 'c', ctrlKey: true }).res).toBeUndefined() // copiar
    expect(fire({ key: 'a', ctrlKey: true }).res).toBeUndefined() // seleccionar todo

    // Editor → no interfiere con nada.
    setBpmnReadOnly(false)
    expect(fire({ key: 'ArrowUp' }).res).toBeUndefined()
    expect(fire({ key: 'Delete' }).res).toBeUndefined()
  })

  it('cancela edición directa si se intenta activar en solo-lectura', () => {
    const bus = makeFakeEventBus()
    const directEditing = { cancel: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (ReadOnlyGuard as any)(bus, { close: vi.fn() }, directEditing)

    setBpmnReadOnly(true)
    expect(bus.invoke('directEditing.activate')).toBe(false)
    expect(directEditing.cancel).toHaveBeenCalledTimes(1)

    setBpmnReadOnly(false)
    directEditing.cancel.mockClear()
    expect(bus.invoke('directEditing.activate')).toBeUndefined()
    expect(directEditing.cancel).not.toHaveBeenCalled()
  })
})

describe('ReadOnlyContextPadProvider (filtro)', () => {
  function makeProvider() {
    const registered: AnyObj[] = []
    const contextPad = { registerProvider: (_p: number, prov: AnyObj) => registered.push(prov) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new (ReadOnlyContextPadProvider as any)(contextPad)
    return provider
  }

  const sampleEntries = {
    'comment.add': { group: 'tools' },
    'delete': { group: 'edit' },
    'connect': { group: 'connect' },
    'replace': { group: 'edit' },
  }

  it('en solo-lectura deja únicamente comment.add', () => {
    const provider = makeProvider()
    const updater = provider.getContextPadEntries()
    expect(typeof updater).toBe('function')

    setBpmnReadOnly(true)
    expect(Object.keys(updater({ ...sampleEntries }))).toEqual(['comment.add'])
  })

  it('como editor no toca las entradas', () => {
    const provider = makeProvider()
    const updater = provider.getContextPadEntries()

    setBpmnReadOnly(false)
    expect(Object.keys(updater({ ...sampleEntries })).sort()).toEqual(
      ['comment.add', 'connect', 'delete', 'replace']
    )
  })

  it('selección múltiple: sin entradas en solo-lectura', () => {
    const provider = makeProvider()
    const updater = provider.getMultiElementContextPadEntries()

    setBpmnReadOnly(true)
    expect(updater({ 'align-elements': {} })).toEqual({})

    setBpmnReadOnly(false)
    expect(updater({ 'align-elements': {} })).toEqual({ 'align-elements': {} })
  })
})

describe('readOnlyState', () => {
  it('setBpmnReadOnly / isBpmnReadOnly', () => {
    setBpmnReadOnly(true)
    expect(isBpmnReadOnly()).toBe(true)
    setBpmnReadOnly(false)
    expect(isBpmnReadOnly()).toBe(false)
  })
})
