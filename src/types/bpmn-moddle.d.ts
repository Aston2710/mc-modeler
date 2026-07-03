/**
 * Tipos mínimos para bpmn-moddle (no publica @types).
 * Solo lo que usa normalizeBpmnXml.
 */
declare module 'bpmn-moddle' {
  export interface ModdleElement {
    $attrs?: Record<string, string>
    [key: string]: unknown
  }
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>)
    fromXML(xml: string): Promise<{ rootElement: ModdleElement; warnings?: unknown[] }>
    toXML(element: ModdleElement, options?: { format?: boolean }): Promise<{ xml?: string }>
  }
}
