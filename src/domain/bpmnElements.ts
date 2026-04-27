export interface BpmnElementDef {
  type: string
  labelKey: string
  category: BpmnCategory
  bpmnType: string
}

export type BpmnCategory = 'events' | 'activities' | 'gateways' | 'connections' | 'containers'

export const BPMN_ELEMENTS: BpmnElementDef[] = [
  // Events
  { type: 'startEvent', labelKey: 'palette.elements.startEvent', category: 'events', bpmnType: 'bpmn:StartEvent' },
  { type: 'startTimerEvent', labelKey: 'palette.elements.startTimerEvent', category: 'events', bpmnType: 'bpmn:StartEvent' },
  { type: 'startMessageEvent', labelKey: 'palette.elements.startMessageEvent', category: 'events', bpmnType: 'bpmn:StartEvent' },
  { type: 'startSignalEvent', labelKey: 'palette.elements.startSignalEvent', category: 'events', bpmnType: 'bpmn:StartEvent' },
  { type: 'startConditionalEvent', labelKey: 'palette.elements.startConditionalEvent', category: 'events', bpmnType: 'bpmn:StartEvent' },
  { type: 'intermediateEvent', labelKey: 'palette.elements.intermediateEvent', category: 'events', bpmnType: 'bpmn:IntermediateCatchEvent' },
  { type: 'intermediateMessageEvent', labelKey: 'palette.elements.intermediateMessageEvent', category: 'events', bpmnType: 'bpmn:IntermediateCatchEvent' },
  { type: 'intermediateTimerEvent', labelKey: 'palette.elements.intermediateTimerEvent', category: 'events', bpmnType: 'bpmn:IntermediateCatchEvent' },
  { type: 'endEvent', labelKey: 'palette.elements.endEvent', category: 'events', bpmnType: 'bpmn:EndEvent' },
  { type: 'endMessageEvent', labelKey: 'palette.elements.endMessageEvent', category: 'events', bpmnType: 'bpmn:EndEvent' },
  { type: 'endErrorEvent', labelKey: 'palette.elements.endErrorEvent', category: 'events', bpmnType: 'bpmn:EndEvent' },
  { type: 'endTerminateEvent', labelKey: 'palette.elements.endTerminateEvent', category: 'events', bpmnType: 'bpmn:EndEvent' },

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
  { type: 'dataObject', labelKey: 'palette.elements.dataObject', category: 'containers', bpmnType: 'bpmn:DataObjectReference' },
]

export const CATEGORY_LABELS: Record<BpmnCategory, string> = {
  events: 'palette.groups.events',
  activities: 'palette.groups.activities',
  gateways: 'palette.groups.gateways',
  connections: 'palette.groups.connections',
  containers: 'palette.groups.containers',
}

export const MAX_ELEMENTS = 500
