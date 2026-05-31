/**
 * phaseUtil.ts — utilidades del elemento "Fase".
 *
 * Una Fase es un divisor vertical (estilo Bizagi) que segmenta el proceso en
 * etapas. BPMN 2.0 no tiene este concepto, así que se modela como un `bpmn:Group`
 * marcado mediante una convención de id (`Phase_*`). El id sobrevive a guardar/
 * recargar el XML BPMN sin necesitar un descriptor moddle custom, y mantiene el
 * `.bpmn` válido para otras herramientas.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any

export const PHASE_ID_PREFIX = 'Phase_'

/** ¿Este elemento es una Fase? (Group con id marcado) */
export function isPhase(element: AnyEl): boolean {
  if (!element) return false
  const id: string = element.id ?? element.businessObject?.id ?? ''
  const type: string = element.type ?? element.businessObject?.$type ?? ''
  return type === 'bpmn:Group' && id.startsWith(PHASE_ID_PREFIX)
}

/**
 * Nombre de la Fase. Se persiste en `flujo:phaseName` (extensión moddle) porque
 * `bpmn:Group` NO tiene atributo `name` en el esquema BPMN y por tanto `bo.name`
 * no se serializa al XML (el nombre se perdía al guardar/sincronizar). Se lee con
 * fallback a `bo.name` para diagramas en memoria aún no migrados.
 */
export function getPhaseName(element: AnyEl): string {
  const bo = element?.businessObject ?? element
  if (!bo) return ''
  return (bo.get?.('flujo:phaseName') ?? bo.phaseName ?? bo.name ?? '') as string
}

/** Escribe el nombre de la Fase en `flujo:phaseName` (persistente) y en `bo.name`. */
export function setPhaseName(element: AnyEl, name: string): void {
  const bo = element?.businessObject ?? element
  if (!bo) return
  if (typeof bo.set === 'function') bo.set('flujo:phaseName', name || undefined)
  else bo.phaseName = name
  // mantener bo.name en memoria para compatibilidad con el snapshot CRDT actual
  bo.name = name
}
