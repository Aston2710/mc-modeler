export interface BpmnElementDef {
  type: string
  labelKey: string
  category: BpmnCategory
  bpmnType: string
  /** bpmn-js event definition class to attach when creating this element */
  eventDefinitionType?: string
}

export type BpmnCategory = 'events' | 'activities' | 'gateways' | 'connections' | 'containers'

export const BPMN_ELEMENTS: BpmnElementDef[] = [
  // Events
  { type: 'startEvent',             labelKey: 'palette.elements.startEvent',             category: 'events', bpmnType: 'bpmn:StartEvent' },
  { type: 'startTimerEvent',        labelKey: 'palette.elements.startTimerEvent',        category: 'events', bpmnType: 'bpmn:StartEvent',              eventDefinitionType: 'bpmn:TimerEventDefinition' },
  { type: 'startMessageEvent',      labelKey: 'palette.elements.startMessageEvent',      category: 'events', bpmnType: 'bpmn:StartEvent',              eventDefinitionType: 'bpmn:MessageEventDefinition' },
  { type: 'startSignalEvent',       labelKey: 'palette.elements.startSignalEvent',       category: 'events', bpmnType: 'bpmn:StartEvent',              eventDefinitionType: 'bpmn:SignalEventDefinition' },
  { type: 'startConditionalEvent',  labelKey: 'palette.elements.startConditionalEvent',  category: 'events', bpmnType: 'bpmn:StartEvent',              eventDefinitionType: 'bpmn:ConditionalEventDefinition' },
  { type: 'intermediateEvent',      labelKey: 'palette.elements.intermediateEvent',      category: 'events', bpmnType: 'bpmn:IntermediateCatchEvent' },
  { type: 'intermediateMessageEvent', labelKey: 'palette.elements.intermediateMessageEvent', category: 'events', bpmnType: 'bpmn:IntermediateCatchEvent', eventDefinitionType: 'bpmn:MessageEventDefinition' },
  { type: 'intermediateTimerEvent', labelKey: 'palette.elements.intermediateTimerEvent', category: 'events', bpmnType: 'bpmn:IntermediateCatchEvent', eventDefinitionType: 'bpmn:TimerEventDefinition' },
  { type: 'endEvent',               labelKey: 'palette.elements.endEvent',               category: 'events', bpmnType: 'bpmn:EndEvent' },
  { type: 'endMessageEvent',        labelKey: 'palette.elements.endMessageEvent',        category: 'events', bpmnType: 'bpmn:EndEvent',                eventDefinitionType: 'bpmn:MessageEventDefinition' },
  { type: 'endErrorEvent',          labelKey: 'palette.elements.endErrorEvent',          category: 'events', bpmnType: 'bpmn:EndEvent',                eventDefinitionType: 'bpmn:ErrorEventDefinition' },
  { type: 'endTerminateEvent',      labelKey: 'palette.elements.endTerminateEvent',      category: 'events', bpmnType: 'bpmn:EndEvent',                eventDefinitionType: 'bpmn:TerminateEventDefinition' },

  // Activities
  { type: 'task', labelKey: 'palette.elements.task', category: 'activities', bpmnType: 'bpmn:Task' },
  { type: 'userTask', labelKey: 'palette.elements.userTask', category: 'activities', bpmnType: 'bpmn:UserTask' },
  { type: 'serviceTask', labelKey: 'palette.elements.serviceTask', category: 'activities', bpmnType: 'bpmn:ServiceTask' },
  { type: 'scriptTask', labelKey: 'palette.elements.scriptTask', category: 'activities', bpmnType: 'bpmn:ScriptTask' },
  { type: 'sendTask', labelKey: 'palette.elements.sendTask', category: 'activities', bpmnType: 'bpmn:SendTask' },
  { type: 'receiveTask', labelKey: 'palette.elements.receiveTask', category: 'activities', bpmnType: 'bpmn:ReceiveTask' },
  { type: 'businessRuleTask', labelKey: 'palette.elements.businessRuleTask', category: 'activities', bpmnType: 'bpmn:BusinessRuleTask' },
  { type: 'subProcess', labelKey: 'palette.elements.subProcess', category: 'activities', bpmnType: 'bpmn:SubProcess' },
  { type: 'callActivity', labelKey: 'palette.elements.callActivity', category: 'activities', bpmnType: 'bpmn:CallActivity' },

  // Gateways
  { type: 'exclusiveGateway', labelKey: 'palette.elements.exclusiveGateway', category: 'gateways', bpmnType: 'bpmn:ExclusiveGateway' },
  { type: 'parallelGateway', labelKey: 'palette.elements.parallelGateway', category: 'gateways', bpmnType: 'bpmn:ParallelGateway' },
  { type: 'inclusiveGateway', labelKey: 'palette.elements.inclusiveGateway', category: 'gateways', bpmnType: 'bpmn:InclusiveGateway' },
  { type: 'eventBasedGateway', labelKey: 'palette.elements.eventBasedGateway', category: 'gateways', bpmnType: 'bpmn:EventBasedGateway' },
  { type: 'complexGateway', labelKey: 'palette.elements.complexGateway', category: 'gateways', bpmnType: 'bpmn:ComplexGateway' },

  // Connections
  { type: 'sequenceFlow', labelKey: 'palette.elements.sequenceFlow', category: 'connections', bpmnType: 'bpmn:SequenceFlow' },
  { type: 'messageFlow', labelKey: 'palette.elements.messageFlow', category: 'connections', bpmnType: 'bpmn:MessageFlow' },
  { type: 'association', labelKey: 'palette.elements.association', category: 'connections', bpmnType: 'bpmn:Association' },
  { type: 'dataAssociation', labelKey: 'palette.elements.dataAssociation', category: 'connections', bpmnType: 'bpmn:DataAssociation' },

  // Containers
  { type: 'pool', labelKey: 'palette.elements.pool', category: 'containers', bpmnType: 'bpmn:Participant' },
  { type: 'lane', labelKey: 'palette.elements.lane', category: 'containers', bpmnType: 'bpmn:Lane' },
  { type: 'group', labelKey: 'palette.elements.group', category: 'containers', bpmnType: 'bpmn:Group' },
  { type: 'textAnnotation', labelKey: 'palette.elements.textAnnotation', category: 'containers', bpmnType: 'bpmn:TextAnnotation' },
  { type: 'image', labelKey: 'imagen', category: 'containers', bpmnType: 'bpmn:TextAnnotation' },
  { type: 'dataObject', labelKey: 'palette.elements.dataObject', category: 'containers', bpmnType: 'bpmn:DataObjectReference' },
]

export const CATEGORY_LABELS: Record<BpmnCategory, string> = {
  events: 'palette.groups.events',
  activities: 'palette.groups.activities',
  gateways: 'palette.groups.gateways',
  connections: 'palette.groups.connections',
  containers: 'palette.groups.containers',
}

export interface BizagiGroup {
  type: string
  variants: string[]
}

/** Each entry is the "base" element shown in the Bizagi palette cell.
 *  variants = sub-types reachable via the dropdown arrow. */
export const BIZAGI_GROUPS: BizagiGroup[] = [
  { type: 'startEvent',        variants: ['startTimerEvent', 'startMessageEvent', 'startSignalEvent', 'startConditionalEvent'] },
  { type: 'task',              variants: ['userTask', 'serviceTask', 'scriptTask', 'sendTask', 'receiveTask', 'businessRuleTask', 'subProcess', 'callActivity'] },
  { type: 'intermediateEvent', variants: ['intermediateMessageEvent', 'intermediateTimerEvent'] },
  { type: 'exclusiveGateway',  variants: ['parallelGateway', 'inclusiveGateway', 'eventBasedGateway', 'complexGateway'] },
  { type: 'endEvent',          variants: ['endMessageEvent', 'endErrorEvent', 'endTerminateEvent'] },
  { type: 'pool',              variants: ['lane'] },
  { type: 'group',             variants: [] },
  { type: 'textAnnotation',    variants: [] },
  { type: 'image',             variants: [] },
  { type: 'dataObject',        variants: [] },
]

export const MAX_ELEMENTS = 500
