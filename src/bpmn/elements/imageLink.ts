/**
 * imageLink.ts — helpers para vincular imágenes de la biblioteca a elementos BPMN.
 *
 * Los ids de imagen se guardan en el atributo moddle `flujo:linkedImages` como
 * lista separada por comas (ver src/bpmn/moddle/flujo.json). Espejo de
 * subProcessLink.ts pero para cualquier FlowNode/Participant/TextAnnotation.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function readRaw(element: AnyObj): string {
  const bo = element?.businessObject ?? element
  return String(bo?.get?.('flujo:linkedImages') ?? bo?.linkedImages ?? '')
}

/** Ids de imagen vinculados al elemento (en orden), o []. */
export function getLinkedImages(element: AnyObj): string[] {
  return readRaw(element).split(',').map((s) => s.trim()).filter(Boolean)
}

export function hasLinkedImages(element: AnyObj): boolean {
  return getLinkedImages(element).length > 0
}

/** Escribe la lista completa (o la limpia con []). */
export function setLinkedImages(modeling: AnyObj, element: AnyObj, ids: string[]): void {
  const value = ids.filter(Boolean).join(',')
  modeling.updateProperties(element, { 'flujo:linkedImages': value || undefined })
}

export function addLinkedImage(modeling: AnyObj, element: AnyObj, id: string): void {
  const ids = getLinkedImages(element)
  if (!ids.includes(id)) setLinkedImages(modeling, element, [...ids, id])
}

export function removeLinkedImage(modeling: AnyObj, element: AnyObj, id: string): void {
  setLinkedImages(modeling, element, getLinkedImages(element).filter((x) => x !== id))
}
