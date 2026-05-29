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
