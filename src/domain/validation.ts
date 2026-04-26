import type { ValidationResult } from './types'

interface BpmnModdle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll(): any[]
}

// Pure BPMN validation — no engine dependency, works on raw moddle elements
export function validateDiagram(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elementRegistry: { getAll(): any[] },
  t: (key: string) => string
): ValidationResult[] {
  const results: ValidationResult[] = []
  const elements = elementRegistry.getAll()

  const processes = elements.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el: any) => el.businessObject?.$type === 'bpmn:Process'
  )

  for (const proc of processes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = proc.children ?? []

    const startEvents = children.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.businessObject?.$type === 'bpmn:StartEvent'
    )
    const endEvents = children.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.businessObject?.$type === 'bpmn:EndEvent'
    )

    if (startEvents.length === 0) {
      results.push({
        id: crypto.randomUUID(),
        elementId: proc.id ?? null,
        elementName: proc.businessObject?.name ?? null,
        severity: 'error',
        code: 'MISSING_START_EVENT',
        message: t('validation.errors.MISSING_START_EVENT'),
      })
    }

    if (endEvents.length === 0) {
      results.push({
        id: crypto.randomUUID(),
        elementId: proc.id ?? null,
        elementName: proc.businessObject?.name ?? null,
        severity: 'error',
        code: 'MISSING_END_EVENT',
        message: t('validation.errors.MISSING_END_EVENT'),
      })
    }
  }

  // Check disconnected elements
  const flowElements = elements.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el: any) => {
      const type = el.businessObject?.$type
      return (
        type &&
        !type.includes('Flow') &&
        !type.includes('Process') &&
        !type.includes('Participant') &&
        !type.includes('Lane') &&
        !type.includes('Collaboration') &&
        !type.includes('TextAnnotation') &&
        !type.includes('Group') &&
        !type.includes('DataObject')
      )
    }
  )

  for (const el of flowElements) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bo = el.businessObject as any
    const incoming = bo?.incoming?.length ?? 0
    const outgoing = bo?.outgoing?.length ?? 0
    const isStart = bo?.$type === 'bpmn:StartEvent'
    const isEnd = bo?.$type === 'bpmn:EndEvent'

    if (!isStart && incoming === 0 && !isEnd && outgoing === 0) {
      results.push({
        id: crypto.randomUUID(),
        elementId: el.id,
        elementName: bo?.name ?? null,
        severity: 'warning',
        code: 'DISCONNECTED_ELEMENT',
        message: t('validation.errors.DISCONNECTED_ELEMENT'),
      })
    }
  }

  return results
}

void (null as unknown as BpmnModdle)
