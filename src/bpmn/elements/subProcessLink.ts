/**
 * subProcessLink.ts — helpers para el enlace de un Subproceso a otro diagrama.
 *
 * El destino se guarda en el atributo moddle `flujo:linkedDiagram` del
 * bpmn:SubProcess (ver src/bpmn/moddle/flujo.json), así persiste en el XML.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

export function isSubProcessElement(element: AnyObj): boolean {
  return element?.type === 'bpmn:SubProcess' || element?.businessObject?.$type === 'bpmn:SubProcess'
}

/** Devuelve el id de diagrama enlazado, o null. */
export function getLinkedDiagram(element: AnyObj): string | null {
  const bo = element?.businessObject ?? element
  const v = bo?.get?.('flujo:linkedDiagram') ?? bo?.linkedDiagram
  return v ? String(v) : null
}

/** Escribe el enlace (o lo limpia con null) usando la API de modeling. */
export function setLinkedDiagram(modeling: AnyObj, element: AnyObj, diagramId: string | null): void {
  modeling.updateProperties(element, { 'flujo:linkedDiagram': diagramId ?? undefined })
}
