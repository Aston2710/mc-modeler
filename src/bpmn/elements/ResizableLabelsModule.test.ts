import { describe, it, expect, vi } from 'vitest'
import ResizableLabelsModule, { AUTO_WRAP_WIDTH } from './ResizableLabelsModule'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** Aplica el patch de getExternalLabelBounds sobre un textRenderer fake. */
function makePatchedTextRenderer() {
  const original = vi.fn((_bounds: Any, _text: string) => ({ x: 1, y: 2, width: 33, height: 14 }))
  const textRenderer: Any = {
    getExternalLabelBounds: original,
    getExternalStyle: () => ({ fontFamily: 'Arial', fontSize: 11, lineHeight: 1.2 }),
  }
  const LabelBoundsPatch = (ResizableLabelsModule as Any).labelBoundsPatch[1]
  new LabelBoundsPatch(textRenderer)
  return { textRenderer, original }
}

describe('LabelBoundsPatch — getExternalLabelBounds', () => {
  it('ancho ≤ 90 delega al layout original (auto)', () => {
    const { textRenderer, original } = makePatchedTextRenderer()
    const bounds = { x: 10, y: 20, width: 80, height: 30, labelTarget: {} }
    const result = textRenderer.getExternalLabelBounds(bounds, 'hola')
    expect(original).toHaveBeenCalledWith(bounds, 'hola')
    expect(result).toEqual({ x: 1, y: 2, width: 33, height: 14 })
  })

  it('import (rect plano sin labelTarget) con ancho manual > 90 → honra el DI tal cual', () => {
    const { textRenderer, original } = makePatchedTextRenderer()
    const diBounds = { x: 100, y: 200, width: 240, height: 42 }
    const result = textRenderer.getExternalLabelBounds(diBounds, 'texto condicional largo')
    expect(original).not.toHaveBeenCalled()
    expect(result).toEqual({ x: 100, y: 200, width: 240, height: 42 })
  })
})

describe('LabelResizeRules', () => {
  function makeRules() {
    // RuleProvider registra listeners en eventBus; capturamos las reglas via addRule
    const rules: Record<string, Any> = {}
    const LabelResizeRules = (ResizableLabelsModule as Any).labelResizeRules[1]
    const instance = Object.create(LabelResizeRules.prototype)
    instance.addRule = (name: string, _prio: number, fn: Any) => { rules[name] = fn }
    instance.init()
    return rules
  }

  it('permite resize de labels externos y respeta tamaño mínimo', () => {
    const rules = makeRules()
    const label = { labelTarget: {} }
    expect(rules['shape.resize']({ shape: label, newBounds: { width: 120, height: 40 } })).toBe(true)
    expect(rules['shape.resize']({ shape: label, newBounds: { width: 10, height: 40 } })).toBe(false)
    expect(rules['shape.resize']({ shape: label })).toBe(true)
  })

  it('no interfiere con shapes normales (undefined → cae a BpmnRules)', () => {
    const rules = makeRules()
    expect(rules['shape.resize']({ shape: { id: 'Task_1' }, newBounds: { width: 100, height: 80 } })).toBeUndefined()
    expect(rules['elements.resize']({ elements: [{ id: 'Task_1' }] })).toBeUndefined()
  })

  it('elements.resize habilita handles para un label único', () => {
    const rules = makeRules()
    expect(rules['elements.resize']({ elements: [{ labelTarget: {} }] })).toBe(true)
    expect(rules['elements.resize']({ elements: [{ labelTarget: {} }, { labelTarget: {} }] })).toBeUndefined()
  })
})

describe('constantes', () => {
  it('umbral manual = 90 (ancho máximo del auto-layout de bpmn-js)', () => {
    expect(AUTO_WRAP_WIDTH).toBe(90)
  })
})
