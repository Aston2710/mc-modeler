import { describe, it, expect } from 'vitest'
import {
  getLinkedImages, hasLinkedImages, setLinkedImages, addLinkedImage, removeLinkedImage,
} from './imageLink'

// Elemento falso: businessObject con get/set que respalda flujo:linkedImages.
function makeElement(initial?: string) {
  const store: Record<string, unknown> = { 'flujo:linkedImages': initial }
  const businessObject = {
    get: (k: string) => store[k],
    set: (k: string, v: unknown) => { store[k] = v },
  }
  return { businessObject, _store: store }
}

// modeling.updateProperties falso: aplica al businessObject vía set.
const modeling = {
  updateProperties: (el: ReturnType<typeof makeElement>, props: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(props)) el.businessObject.set(k, v)
  },
}

describe('imageLink', () => {
  it('getLinkedImages parsea CSV y descarta vacíos', () => {
    expect(getLinkedImages(makeElement())).toEqual([])
    expect(getLinkedImages(makeElement('a, b ,,c'))).toEqual(['a', 'b', 'c'])
  })

  it('hasLinkedImages refleja presencia', () => {
    expect(hasLinkedImages(makeElement())).toBe(false)
    expect(hasLinkedImages(makeElement('x'))).toBe(true)
  })

  it('setLinkedImages escribe CSV y limpia a undefined cuando vacío', () => {
    const el = makeElement('a')
    setLinkedImages(modeling, el, ['a', 'b'])
    expect(getLinkedImages(el)).toEqual(['a', 'b'])
    setLinkedImages(modeling, el, [])
    expect(el._store['flujo:linkedImages']).toBeUndefined()
  })

  it('addLinkedImage no duplica', () => {
    const el = makeElement('a')
    addLinkedImage(modeling, el, 'a')
    addLinkedImage(modeling, el, 'b')
    expect(getLinkedImages(el)).toEqual(['a', 'b'])
  })

  it('removeLinkedImage quita el id', () => {
    const el = makeElement('a,b,c')
    removeLinkedImage(modeling, el, 'b')
    expect(getLinkedImages(el)).toEqual(['a', 'c'])
  })
})
