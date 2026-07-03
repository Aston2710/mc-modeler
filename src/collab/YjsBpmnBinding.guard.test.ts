import { describe, it, expect } from 'vitest'
import { resolveParentOrSkip, orderShapeAdds } from './YjsBpmnBinding'
import type { ElementSnapshot } from './yBpmnModel'

// Registro simulado: solo conoce los elementos del diagrama "propio".
const makeRegistry = (ids: string[]) => ({
  get: (id: string) => (ids.includes(id) ? { id } : undefined),
})
const root = { id: 'Collaboration_1' }

describe('resolveParentOrSkip — candado anti-superposición', () => {
  it('sin parent declarado → raíz del canvas', () => {
    expect(resolveParentOrSkip(undefined, makeRegistry([]), root)).toBe(root)
  })

  it('parent existe en el registro → ese elemento', () => {
    const reg = makeRegistry(['Part_PLN_F_07'])
    expect(resolveParentOrSkip('Part_PLN_F_07', reg, root)).toEqual({ id: 'Part_PLN_F_07' })
  })

  it('parent === id de la raíz (aunque el registro no lo devuelva) → raíz', () => {
    expect(resolveParentOrSkip('Collaboration_1', makeRegistry([]), root)).toBe(root)
  })

  it('CONTAMINACIÓN: parent ajeno no resoluble + el canvas YA tiene pool → null (DESCARTAR)', () => {
    // El bug real: pool de otro diagrama (parent Collab_LOG02) cuando ESTE diagrama
    // ya tiene su pool propia. Es una pool extra ajena → no se dibuja.
    expect(resolveParentOrSkip('Collab_LOG02', makeRegistry(['Part_PLN_F_07']), root, true)).toBeNull()
  })

  it('CONTAMINACIÓN: descendiente de pool ajena (su pool ya se descartó) + hay pool propia → null', () => {
    expect(resolveParentOrSkip('Part_LOG02', makeRegistry(['Part_PLN_F_07']), root, true)).toBeNull()
  })

  it('BENIGNO: parent no resoluble pero el canvas NO tiene pools (XML solo-proceso) → raíz (pool propia en Yjs)', () => {
    // 23 diagramas reales caen aquí: su única pool vive en Yjs, el XML es solo-proceso.
    // NO debe descartarse o la pool desaparecería.
    expect(resolveParentOrSkip('Id_b4af7b26', makeRegistry([]), root, false)).toBe(root)
  })

  it('por defecto (sin flag) trata parent no resoluble como pool propia → raíz (no rompe nada)', () => {
    expect(resolveParentOrSkip('Collaboration_ajena', makeRegistry([]), root)).toBe(root)
  })

  it('sin raíz disponible y sin parent → null (no crea a ciegas)', () => {
    expect(resolveParentOrSkip(undefined, makeRegistry([]), null)).toBeNull()
  })
})

describe('orderShapeAdds — contenedores primero', () => {
  const snap = (id: string, type: string): ElementSnapshot => ({ id, type } as ElementSnapshot)

  it('ordena Participant → Lane → resto', () => {
    const input = [
      snap('task1', 'bpmn:Task'),
      snap('lane1', 'bpmn:Lane'),
      snap('pool1', 'bpmn:Participant'),
      snap('task2', 'bpmn:Task'),
    ]
    const out = orderShapeAdds(input).map((s) => s.id)
    expect(out).toEqual(['pool1', 'lane1', 'task1', 'task2'])
  })

  it('es estable dentro del mismo rango y no muta el input', () => {
    const input = [snap('a', 'bpmn:Task'), snap('b', 'bpmn:Task')]
    const out = orderShapeAdds(input)
    expect(out.map((s) => s.id)).toEqual(['a', 'b'])
    expect(input.map((s) => s.id)).toEqual(['a', 'b']) // input intacto
  })
})
