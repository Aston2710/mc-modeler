import JSZip from 'jszip'

export interface BpmExportOptions {
  diagramName: string
  bpmnXml: string
  author?: string
}

// ─── Static XML constants ────────────────────────────────────────────────────

const ACTIONS_XML = `<?xml version="1.0" encoding="utf-8"?>
<DiagramActions xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" />`

const BPSIM_RESULT_XML = `<?xml version="1.0" encoding="utf-8"?>
<ScenarioResults />`

const PARTICIPANTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<Participants xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.wfmc.org/2009/XPDL2.2" />`

const PREFERENCES_BPP = `<?xml version="1.0" encoding="utf-8"?><ProjectPreferences><VersionFile version="3" /></ProjectPreferences>`

const DOCUMENTATION_SETTINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<DocumentationSettings xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SourceType>User</SourceType>
  <ExportBPMNAttachments>false</ExportBPMNAttachments>
  <ShapeFilters />
  <RoleFiltersString>{}</RoleFiltersString>
  <SelectedDiagrams />
  <htmlFolderHierarchy xsi:nil="true" />
  <Settings />
</DocumentationSettings>`

const PRINTING_PREFERENCES_XML = `<?xml version="1.0" encoding="utf-8"?>
<PrintingPreferences xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" AutoFitToPagesWidth="0" ScaleFactor="1">
  <Margins Bottom="0" Top="0" Left="0" Right="0" />
  <Watermark ImageTiling="false" ImageTransparency="0" TextTransparency="0" ShowBehind="false" />
</PrintingPreferences>`

// ─── Bizagi color constants (signed INT32 ARGB) ───────────────────────────────

const C = {
  task:              { border: -16553830, fill: -1249281 },
  startEvent:        { border: -10311914, fill: -1638505 },
  endEvent:          { border: -6750208,  fill: -1135958 },
  intermediateEvent: { border: -10311914, fill: -1638505 },
  gateway:           { border: -5855715,  fill: -52 },
  lane:              { border: -11513776, fill: -1 },
  pool:              { border: -16777216, fill: -1 },
  annotation:        { border: -2763307,  fill: -2763307 },
  dataObject:        { border: -16777216, fill: -1 },
  group:             { border: -10066330, fill: -986896 },
  black:             -16777216,
  white:             16777215,
}

// Namespace de nuestras extensiones (phaseName / phaseColor) en el BPMN de origen.
const FLUJO_NS = 'http://flujo.app/schema/bpmn'
// Borde de milestone en Bizagi: RGB(80,80,80) = #505050 → ARGB signed.
const MILESTONE_BORDER = -11579824

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bounds { x: number; y: number; width: number; height: number }
interface Point  { x: number; y: number }

interface ParsedBpmn {
  ns:            Record<string, string>
  shapes:        Map<string, Bounds>
  labelBounds:   Map<string, Bounds>
  edges:         Map<string, Point[]>
  participants:  Element[]
  processes:     Element[]
  annotations:   Element[]
  associations:  Element[]
  groups:        Element[]
  dataObjects:   Element[]
  messageFlows:  Element[]
  categoryValues: Map<string, string>  // categoryValue id → value (nombre de grupos)
  idMap:         Map<string, string>   // bpmn-js ID → Bizagi UUID
}

// ─── BPMN XML parser ──────────────────────────────────────────────────────────

const FLOW_NODE_TAGS = [
  'startEvent', 'endEvent', 'intermediateCatchEvent', 'intermediateThrowEvent',
  'task', 'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'sendTask', 'receiveTask',
  'businessRuleTask', 'callActivity', 'subProcess',
  'exclusiveGateway', 'parallelGateway', 'inclusiveGateway',
  'eventBasedGateway', 'complexGateway',
  'sequenceFlow',
]

function parseBpmnXml(xml: string): ParsedBpmn {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(xml, 'text/xml')
  const ns = {
    bpmn:   'http://www.omg.org/spec/BPMN/20100524/MODEL',
    bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
    dc:     'http://www.omg.org/spec/DD/20100524/DC',
    di:     'http://www.omg.org/spec/DD/20100524/DI',
  }

  // Case-INSENSITIVE: bpmn-js/moddle serializa los tipos con extensión moddle
  // (SequenceFlow, Group, Association, MessageFlow, SubProcess) en PascalCase,
  // mientras que tareas/eventos van en camelCase. getElementsByTagNameNS distingue
  // mayúsculas, así que comparamos el localName en minúsculas para capturar ambos.
  const all = (parent: Element | Document, tag: string, nsUri: string): Element[] => {
    const lower = tag.toLowerCase()
    return Array.from(parent.getElementsByTagNameNS(nsUri, '*'))
      .filter((el) => el.localName.toLowerCase() === lower)
  }

  const root = doc.documentElement

  // shapes + label bounds from BPMNDiagram
  const shapes      = new Map<string, Bounds>()
  const labelBounds = new Map<string, Bounds>()

  all(doc, 'BPMNShape', ns.bpmndi).forEach(shape => {
    const id = shape.getAttribute('bpmnElement')
    if (!id) return
    const b = shape.getElementsByTagNameNS(ns.dc, 'Bounds')[0]
    if (b) {
      shapes.set(id, {
        x:      parseFloat(b.getAttribute('x')      ?? '0'),
        y:      parseFloat(b.getAttribute('y')      ?? '0'),
        width:  parseFloat(b.getAttribute('width')  ?? '0'),
        height: parseFloat(b.getAttribute('height') ?? '0'),
      })
    }
    const lblEl = shape.getElementsByTagNameNS(ns.bpmndi, 'BPMNLabel')[0]
    if (lblEl) {
      const lb = lblEl.getElementsByTagNameNS(ns.dc, 'Bounds')[0]
      if (lb) {
        labelBounds.set(id, {
          x:      parseFloat(lb.getAttribute('x')      ?? '0'),
          y:      parseFloat(lb.getAttribute('y')      ?? '0'),
          width:  parseFloat(lb.getAttribute('width')  ?? '0'),
          height: parseFloat(lb.getAttribute('height') ?? '0'),
        })
      }
    }
  })

  // edge waypoints
  const edges = new Map<string, Point[]>()
  all(doc, 'BPMNEdge', ns.bpmndi).forEach(edge => {
    const id = edge.getAttribute('bpmnElement')
    if (!id) return
    edges.set(id, all(edge, 'waypoint', ns.di).map(wp => ({
      x: parseFloat(wp.getAttribute('x') ?? '0'),
      y: parseFloat(wp.getAttribute('y') ?? '0'),
    })))
  })

  // process model elements
  const collaboration = all(root, 'collaboration', ns.bpmn)[0] ?? null
  const participants  = collaboration ? all(collaboration, 'participant', ns.bpmn) : []
  const processes     = all(root, 'process', ns.bpmn)
  const annotations   = all(root, 'textAnnotation', ns.bpmn)
  const associations  = all(root, 'association', ns.bpmn)
  const groups        = all(root, 'group', ns.bpmn)
  const dataObjects   = all(root, 'dataObjectReference', ns.bpmn)
  const messageFlows  = all(root, 'messageFlow', ns.bpmn)

  // Nombre de los grupos: bpmn-js lo guarda en categoryValue (referenciado por
  // group.categoryValueRef), no en un atributo `name`.
  const categoryValues = new Map<string, string>()
  all(root, 'categoryValue', ns.bpmn).forEach(cv => {
    const cid = cv.getAttribute('id')
    if (cid) categoryValues.set(cid, cv.getAttribute('value') ?? '')
  })

  // ─── Build ID → UUID map (Bizagi requires valid GUIDs for all Id attributes) ──
  const idMap = new Map<string, string>()
  const reg   = (id: string | null) => { if (id && !idMap.has(id)) idMap.set(id, crypto.randomUUID()) }

  participants.forEach(p => {
    reg(p.getAttribute('id'))
    reg(p.getAttribute('processRef'))
  })

  processes.forEach(proc => {
    reg(proc.getAttribute('id'))
    all(proc, 'laneSet', ns.bpmn).forEach(ls =>
      all(ls, 'lane', ns.bpmn).forEach(lane => reg(lane.getAttribute('id')))
    )
    FLOW_NODE_TAGS.forEach(tag =>
      all(proc, tag, ns.bpmn).forEach(el => reg(el.getAttribute('id')))
    )
  })

  ;[...annotations, ...associations, ...groups, ...dataObjects, ...messageFlows].forEach(el => reg(el.getAttribute('id')))

  return { ns, shapes, labelBounds, edges, participants, processes, annotations, associations, groups, dataObjects, messageFlows, categoryValues, idMap }
}

// ─── ID helper: original bpmn-js ID → Bizagi UUID ────────────────────────────

function uid(idMap: Map<string, string>, origId: string): string {
  return idMap.get(origId) ?? origId
}

// ─── XML string helpers ───────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatting(fontSize = 8, bold = false): string {
  return `<Formatting>
              <Alignment>Center</Alignment>
              <FontName>Segoe UI</FontName>
              <SizeFont>${fontSize}</SizeFont>
              <Bold>${bold}</Bold>
              <Italic>false</Italic>
              <Strikeout>false</Strikeout>
              <Underline>false</Underline>
              <ColorFont>${C.black}</ColorFont>
            </Formatting>
            <TextDirection xsi:nil="true" />`
}

// ─── Label position (external labels: events, gateways) ──────────────────────
// Bizagi needs TextWidth > element width to avoid clipping.
// TextX offset centers the 90px label under the shape.

function externalLabel(b: Bounds, _lb?: Bounds, kind: 'event' | 'gateway' = 'event'): { tx: number; ty: number; tw: number; th: number } {
  return {
    tx: kind === 'gateway' ? b.x - 25 : b.x - 30,
    ty: b.y + b.height,
    tw: 90,
    th: 30,
  }
}

// ─── Activity builders ────────────────────────────────────────────────────────

const BPMN_MODEL_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL'

/** bpmn:documentation del elemento → <Documentation> XPDL (o vacío). */
function docXml(el: Element): string {
  const d = el.getElementsByTagNameNS(BPMN_MODEL_NS, 'documentation')[0]?.textContent?.trim()
  return d ? `<Documentation>${esc(d)}</Documentation>` : '<Documentation />'
}

// BPMN eventDefinition → (valor Trigger/Result XPDL, elemento hijo XPDL 2.2).
const EVENT_DEFS: Array<[string, string, string]> = [
  ['timerEventDefinition',       'Timer',        '<TriggerTimer />'],
  ['messageEventDefinition',     'Message',      '<TriggerResultMessage />'],
  ['signalEventDefinition',      'Signal',       '<TriggerResultSignal />'],
  ['errorEventDefinition',       'Error',        '<ResultError />'],
  ['escalationEventDefinition',  'Escalation',   '<ResultEscalation />'],
  ['conditionalEventDefinition', 'Conditional',  '<TriggerConditional />'],
  ['terminateEventDefinition',   'Terminate',    '<ResultTerminate />'],
  ['linkEventDefinition',        'Link',         '<TriggerResultLink />'],
  ['compensateEventDefinition',  'Compensation', '<ResultCompensation />'],
]

function eventKind(el: Element): { kind: string; child: string } {
  for (const [bpmn, kind, child] of EVENT_DEFS) {
    if (el.getElementsByTagNameNS(BPMN_MODEL_NS, bpmn).length) return { kind, child }
  }
  return { kind: 'None', child: '' }
}

/** `<Event>` XPDL con su trigger/result según el eventDefinition del BPMN. */
function eventXml(el: Element, tag: 'StartEvent' | 'EndEvent' | 'IntermediateEvent', attr: 'Trigger' | 'Result'): string {
  const ev = eventKind(el)
  if (ev.kind === 'None') return `<Event><${tag} ${attr}="None" /></Event>`
  return `<Event><${tag} ${attr}="${ev.kind}">${ev.child}</${tag}></Event>`
}

function buildStartEvent(
  el: Element,
  shapes: Map<string, Bounds>,
  labelBounds: Map<string, Bounds>,
  idMap: Map<string, string>,
): string {
  const origId = el.getAttribute('id') ?? ''
  const id     = uid(idMap, origId)
  const name   = el.getAttribute('name') ?? ''
  const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 30, height: 30 }
  const lp     = externalLabel(b, labelBounds.get(origId))
  return `<Activity Id="${id}" Name="${esc(name)}">
        <Description />
        ${eventXml(el, 'StartEvent', 'Trigger')}
        ${docXml(el)}
        <NodeGraphicsInfos>
          <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.startEvent.border}" FillColor="${C.startEvent.fill}" BorderVisible="false" TextX="${lp.tx}" TextY="${lp.ty}" TextWidth="${lp.tw}" TextHeight="${lp.th}">
            <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
            ${formatting()}
            <TextBackgroundColor>${C.white}</TextBackgroundColor>
          </NodeGraphicsInfo>
        </NodeGraphicsInfos>
        <ExtendedAttributes><ExtendedAttribute Name="RuntimeProperties" Value="{}" /></ExtendedAttributes>
      </Activity>`
}

function buildEndEvent(
  el: Element,
  shapes: Map<string, Bounds>,
  labelBounds: Map<string, Bounds>,
  idMap: Map<string, string>,
): string {
  const origId = el.getAttribute('id') ?? ''
  const id     = uid(idMap, origId)
  const name   = el.getAttribute('name') ?? ''
  const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 30, height: 30 }
  const lp     = externalLabel(b, labelBounds.get(origId))
  return `<Activity Id="${id}" Name="${esc(name)}">
        <Description />
        ${eventXml(el, 'EndEvent', 'Result')}
        ${docXml(el)}
        <NodeGraphicsInfos>
          <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.endEvent.border}" FillColor="${C.endEvent.fill}" BorderVisible="false" TextX="${lp.tx}" TextY="${lp.ty}" TextWidth="${lp.tw}" TextHeight="${lp.th}">
            <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
            ${formatting()}
            <TextBackgroundColor>${C.white}</TextBackgroundColor>
          </NodeGraphicsInfo>
        </NodeGraphicsInfos>
        <ExtendedAttributes />
      </Activity>`
}

function buildIntermediateEvent(
  el: Element,
  shapes: Map<string, Bounds>,
  labelBounds: Map<string, Bounds>,
  idMap: Map<string, string>,
): string {
  const origId = el.getAttribute('id') ?? ''
  const id     = uid(idMap, origId)
  const name   = el.getAttribute('name') ?? ''
  const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 30, height: 30 }
  const lp     = externalLabel(b, labelBounds.get(origId))
  return `<Activity Id="${id}" Name="${esc(name)}">
        <Description />
        ${eventXml(el, 'IntermediateEvent', 'Trigger')}
        ${docXml(el)}
        <NodeGraphicsInfos>
          <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.intermediateEvent.border}" FillColor="${C.intermediateEvent.fill}" BorderVisible="false" TextX="${lp.tx}" TextY="${lp.ty}" TextWidth="${lp.tw}" TextHeight="${lp.th}">
            <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
            ${formatting()}
            <TextBackgroundColor>${C.white}</TextBackgroundColor>
          </NodeGraphicsInfo>
        </NodeGraphicsInfos>
        <ExtendedAttributes />
      </Activity>`
}

/** Subtipo de tarea BPMN → <Implementation> XPDL (tipos estándar XPDL 2.2). */
function taskImplementation(localName: string): string {
  const sub: Record<string, string> = {
    userTask:         '<TaskUser />',
    serviceTask:      '<TaskService />',
    scriptTask:       '<TaskScript />',
    manualTask:       '<TaskManual />',
    sendTask:         '<TaskSend />',
    receiveTask:      '<TaskReceive />',
    businessRuleTask: '<TaskBusinessRule />',
  }
  const child = sub[localName]
  return child ? `<Implementation><Task>${child}</Task></Implementation>` : '<Implementation><Task /></Implementation>'
}

function buildTask(
  el: Element,
  shapes: Map<string, Bounds>,
  idMap: Map<string, string>,
): string {
  const origId = el.getAttribute('id') ?? ''
  const id     = uid(idMap, origId)
  const name   = el.getAttribute('name') ?? ''
  const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 120, height: 60 }
  return `<Activity Id="${id}" Name="${esc(name)}">
        <Description />
        ${taskImplementation(el.localName)}
        <Performers />
        ${docXml(el)}
        <Loop LoopType="None" />
        <NodeGraphicsInfos>
          <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.task.border}" FillColor="${C.task.fill}" BorderVisible="false" TextWidth="${b.width}" TextHeight="${b.height}">
            <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
            ${formatting()}
            <TextBackgroundColor>${C.white}</TextBackgroundColor>
          </NodeGraphicsInfo>
        </NodeGraphicsInfos>
        <ExtendedAttributes />
      </Activity>`
}

function buildGateway(
  el: Element,
  shapes: Map<string, Bounds>,
  labelBounds: Map<string, Bounds>,
  gatewayType: string,
  idMap: Map<string, string>,
): string {
  const origId = el.getAttribute('id') ?? ''
  const id     = uid(idMap, origId)
  const name   = el.getAttribute('name') ?? ''
  const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 40, height: 40 }
  const lp     = externalLabel(b, labelBounds.get(origId), 'gateway')
  // Bizagi usa GatewayType en palabras (+ GatewayDirection).
  const dir    = el.getAttribute('gatewayDirection') || 'Unspecified'
  return `<Activity Id="${id}" Name="${esc(name)}">
        <Description />
        <Route GatewayType="${gatewayType}" GatewayDirection="${dir}" />
        ${docXml(el)}
        <NodeGraphicsInfos>
          <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.gateway.border}" FillColor="${C.gateway.fill}" BorderVisible="false" TextX="${lp.tx}" TextY="${lp.ty}" TextWidth="${lp.tw}" TextHeight="${lp.th}">
            <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
            ${formatting()}
            <TextBackgroundColor>${C.white}</TextBackgroundColor>
          </NodeGraphicsInfo>
        </NodeGraphicsInfos>
        <ExtendedAttributes />
      </Activity>`
}

/** Objeto de datos en formato NATIVO de Bizagi: <DataObject> dentro de
 *  <DataObjects> del WorkflowProcess (NO como <Artifact ArtifactType="DataObject">,
 *  que Bizagi no reconoce como objeto de datos). */
function buildDataObject(
  el: Element,
  shapes: Map<string, Bounds>,
  idMap: Map<string, string>,
): string {
  const origId = el.getAttribute('id') ?? ''
  const id     = uid(idMap, origId)
  const name   = el.getAttribute('name') ?? ''
  const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 40, height: 50 }
  const doc    = el.getElementsByTagNameNS(BPMN_MODEL_NS, 'documentation')[0]?.textContent?.trim() ?? ''
  return `<DataObject Id="${id}" Name="${esc(name)}">
          <Object>
            ${doc ? `<Documentation>${esc(doc)}</Documentation>` : '<Documentation />'}
          </Object>
          <NodeGraphicsInfos>
            <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.dataObject.border}" FillColor="${C.dataObject.fill}" BorderVisible="false" TextX="${b.x - 27}" TextY="${b.y + b.height}" TextWidth="90" TextHeight="30">
              <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
              ${formatting()}
              <TextBackgroundColor>${C.white}</TextBackgroundColor>
            </NodeGraphicsInfo>
          </NodeGraphicsInfos>
          <DataField />
          <ExtendedAttributes />
        </DataObject>`
}

/** Sección <DataObjects> del WorkflowProcess con los objetos de datos del proceso. */
function buildDataObjects(process: Element, parsed: ParsedBpmn): string {
  const { ns, shapes, idMap } = parsed
  const dos = Array.from(process.getElementsByTagNameNS(ns.bpmn, '*'))
    .filter((el) => el.localName.toLowerCase() === 'dataobjectreference')
  if (dos.length === 0) return ''
  const items = dos.map((el) => buildDataObject(el, shapes, idMap)).join('\n        ')
  return `\n    <DataObjects>\n        ${items}\n      </DataObjects>`
}

function buildTransition(
  el: Element,
  edges: Map<string, Point[]>,
  idMap: Map<string, string>,
): string {
  const origId   = el.getAttribute('id')         ?? ''
  const origFrom = el.getAttribute('sourceRef')   ?? ''
  const origTo   = el.getAttribute('targetRef')   ?? ''
  const id       = uid(idMap, origId)
  const from     = uid(idMap, origFrom)
  const to       = uid(idMap, origTo)
  const name     = el.getAttribute('name') ?? ''
  const wps      = edges.get(origId) ?? []
  const midX     = wps.length >= 2 ? Math.round((wps[0].x + wps[wps.length - 1].x) / 2) : 0
  const midY     = wps.length >= 2 ? Math.round((wps[0].y + wps[wps.length - 1].y) / 2) : 0
  const condEl   = el.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'conditionExpression')[0]
  const condXml  = condEl
    ? `<Condition><Expression>${esc(condEl.textContent ?? '')}</Expression></Condition>`
    : '<Condition />'
  const coords   = wps.map(p => `<Coordinates XCoordinate="${p.x}" YCoordinate="${p.y}" />`).join('\n              ')
  return `<Transition Id="${id}" Name="${esc(name)}" From="${from}" To="${to}">
        ${condXml}
        <Description />
        <ConnectorGraphicsInfos>
          <ConnectorGraphicsInfo ToolId="BizAgi_Process_Modeler" BorderColor="${C.black}" TextX="${midX}" TextY="${midY}">
            ${formatting()}
            <TextBackgroundColor>${C.white}</TextBackgroundColor>
            ${coords}
          </ConnectorGraphicsInfo>
        </ConnectorGraphicsInfos>
        <ExtendedAttributes />
      </Transition>`
}

// ─── Process content builder ──────────────────────────────────────────────────

const TASK_TYPES = ['task', 'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'sendTask', 'receiveTask', 'businessRuleTask', 'callActivity', 'subProcess']

function buildProcessContent(process: Element, parsed: ParsedBpmn): { activities: string[]; transitions: string[] } {
  const { ns, shapes, labelBounds, edges, idMap } = parsed
  // Case-insensitive (ver nota en parseBpmnXml): captura `sequenceFlow` y
  // `SequenceFlow` (PascalCase por la extensión moddle ManualRoute).
  const get = (tag: string) => {
    const lower = tag.toLowerCase()
    return Array.from(process.getElementsByTagNameNS(ns.bpmn, '*'))
      .filter((el) => el.localName.toLowerCase() === lower)
  }

  const activities:  string[] = []
  const transitions: string[] = []

  get('startEvent').forEach(el => activities.push(buildStartEvent(el, shapes, labelBounds, idMap)))
  get('endEvent').forEach(el => activities.push(buildEndEvent(el, shapes, labelBounds, idMap)))
  get('intermediateCatchEvent').forEach(el => activities.push(buildIntermediateEvent(el, shapes, labelBounds, idMap)))
  get('intermediateThrowEvent').forEach(el => activities.push(buildIntermediateEvent(el, shapes, labelBounds, idMap)))

  TASK_TYPES.forEach(type => get(type).forEach(el => activities.push(buildTask(el, shapes, idMap))))

  get('exclusiveGateway').forEach(el => activities.push(buildGateway(el, shapes, labelBounds, 'Exclusive', idMap)))
  get('parallelGateway').forEach(el => activities.push(buildGateway(el, shapes, labelBounds, 'Parallel', idMap)))
  get('inclusiveGateway').forEach(el => activities.push(buildGateway(el, shapes, labelBounds, 'Inclusive', idMap)))
  get('eventBasedGateway').forEach(el => activities.push(buildGateway(el, shapes, labelBounds, 'ExclusiveEventBased', idMap)))
  get('complexGateway').forEach(el => activities.push(buildGateway(el, shapes, labelBounds, 'Complex', idMap)))

  get('sequenceFlow').forEach(el => transitions.push(buildTransition(el, edges, idMap)))

  return { activities, transitions }
}

// ─── Lanes builder ────────────────────────────────────────────────────────────

function defaultLaneXml(laneId: string, poolId: string, poolBounds: Bounds, laneName = ''): string {
  const b = { x: poolBounds.x, y: poolBounds.y, width: poolBounds.width, height: poolBounds.height }
  // Coordinates RELATIVAS al pool (Bizagi guarda los lanes relativos); TextX/Y también relativas.
  return `<Lane Id="${laneId}" Name="${esc(laneName)}" ParentPool="${poolId}">
          <NodeGraphicsInfos>
            <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.lane.border}" FillColor="${C.lane.fill}" BorderVisible="false" TextX="0" TextY="0" TextWidth="${b.width}" TextHeight="${b.height}">
              <Coordinates XCoordinate="0" YCoordinate="0" />
              ${formatting(8, true)}
              <TextBackgroundColor>${C.white}</TextBackgroundColor>
            </NodeGraphicsInfo>
          </NodeGraphicsInfos>
          <Documentation />
          <ExtendedAttributes />
        </Lane>`
}

function buildLanes(
  laneSet: Element | undefined,
  poolId: string,
  poolBounds: Bounds,
  shapes: Map<string, Bounds>,
  idMap: Map<string, string>,
  poolName = '',
): string {
  const lanes = laneSet
    ? Array.from(laneSet.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'lane'))
    : []

  if (lanes.length === 0) {
    // Bizagi needs at least one Lane to render the pool container; use pool name, not hardcoded string
    return `<Lanes>\n        ${defaultLaneXml(crypto.randomUUID(), poolId, poolBounds, poolName)}\n      </Lanes>`
  }

  const laneXmls = lanes.map(lane => {
    const origId = lane.getAttribute('id') ?? ''
    const id     = uid(idMap, origId)
    const name   = lane.getAttribute('name') ?? ''
    const b      = shapes.get(origId) ?? { x: 60, y: 40, width: 870, height: 150 }
    // Coordinates RELATIVAS al pool (Bizagi guarda los lanes relativos); TextX/Y absolutas.
    return `<Lane Id="${id}" Name="${esc(name)}" ParentPool="${poolId}">
          <NodeGraphicsInfos>
            <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.lane.border}" FillColor="${C.lane.fill}" BorderVisible="false" TextX="${b.x}" TextY="${b.y}" TextWidth="${b.width}" TextHeight="${b.height}">
              <Coordinates XCoordinate="${b.x - poolBounds.x}" YCoordinate="${b.y - poolBounds.y}" />
              ${formatting(8, true)}
              <TextBackgroundColor>${C.white}</TextBackgroundColor>
            </NodeGraphicsInfo>
          </NodeGraphicsInfos>
          <Documentation />
          <ExtendedAttributes />
        </Lane>`
  })

  return `<Lanes>\n        ${laneXmls.join('\n        ')}\n      </Lanes>`
}

// ─── Fases → Milestones (estilo Bizagi) ────────────────────────────────────────

/** ¿Es un Group que en realidad es una Fase? (id `Phase_*`). */
function isPhaseGroup(el: Element): boolean {
  return (el.getAttribute('id') ?? '').startsWith('Phase_')
}

/** Nombre de la fase desde el BPMN de origen (flujo:phaseName → name). */
function phaseNameOf(el: Element): string {
  return el.getAttributeNS(FLUJO_NS, 'phaseName')
    || el.getAttribute('flujo:phaseName')
    || el.getAttribute('name')
    || 'Fase'
}

/** Color de la fase (flujo:phaseColor hex) → entero ARGB de Bizagi. */
function phaseColorOf(el: Element): number {
  const hex = el.getAttributeNS(FLUJO_NS, 'phaseColor') || el.getAttribute('flujo:phaseColor')
  return hex ? hexToBizagiColor(hex) : C.group.fill
}

/** "#RRGGBB" → entero ARGB con signo (formato de color de Bizagi). */
function hexToBizagiColor(hex: string): number {
  let h = (hex || '').replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return C.group.fill
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return ((0xff << 24) | (r << 16) | (g << 8) | b) | 0 // ARGB con signo
}

/** Emite `<Milestones>` con las fases cuyo centro cae dentro del pool. Coords
 *  RELATIVAS al pool (X -= pool.X), como hace Bizagi. */
function buildMilestones(
  phaseGroups: Element[],
  poolId: string,
  poolBounds: Bounds,
  shapes: Map<string, Bounds>,
  idMap: Map<string, string>,
): string {
  const inside = phaseGroups.filter((el) => {
    const b = shapes.get(el.getAttribute('id') ?? '')
    if (!b) return false
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    return cx >= poolBounds.x && cx <= poolBounds.x + poolBounds.width
      && cy >= poolBounds.y && cy <= poolBounds.y + poolBounds.height
  })
  if (inside.length === 0) return ''
  const items = inside.map((el) => {
    const origId = el.getAttribute('id') ?? ''
    const id     = uid(idMap, origId)
    const name   = phaseNameOf(el)
    const b      = shapes.get(origId) ?? { x: poolBounds.x, y: poolBounds.y, width: 300, height: 300 }
    const relX   = Math.round(b.x - poolBounds.x)
    const relY   = Math.round(b.y - poolBounds.y)
    return `<Milestone Id="${id}" Name="${esc(name)}" ParentPool="${poolId}">
        <NodeGraphicsInfos>
          <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${MILESTONE_BORDER}" FillColor="${phaseColorOf(el)}" BorderVisible="false" TextX="${b.x}" TextY="${b.y}" TextWidth="${b.width}" TextHeight="${b.height}">
            <Coordinates XCoordinate="${relX}" YCoordinate="${relY}" />
            ${formatting(9, true)}
          </NodeGraphicsInfo>
        </NodeGraphicsInfos>
        <Documentation />
        <ExtendedAttributes>
          <ExtendedAttribute Name="RuntimeProperties" Value="{&quot;milestoneType&quot;:&quot;Process&quot;}" />
        </ExtendedAttributes>
      </Milestone>`
  })
  return `\n    <Milestones>\n        ${items.join('\n        ')}\n      </Milestones>`
}

// ─── Pool builder ─────────────────────────────────────────────────────────────

function buildPool(participant: Element, process: Element | null, parsed: ParsedBpmn, phaseGroups: Element[] = []): string {
  const { ns, shapes, idMap } = parsed
  const origId         = participant.getAttribute('id') ?? ''
  const origProcessRef = participant.getAttribute('processRef') ?? origId
  const id             = uid(idMap, origId)
  const processRef     = uid(idMap, origProcessRef)
  const name           = participant.getAttribute('name') ?? ''
  const b              = shapes.get(origId) ?? { x: 30, y: 40, width: 900, height: 300 }
  const laneSet  = process?.getElementsByTagNameNS(ns.bpmn, 'laneSet')[0]
  const lanesXml = buildLanes(laneSet, id, b, shapes, idMap, name)
  const milestonesXml = buildMilestones(phaseGroups, id, b, shapes, idMap)

  return `<Pool Id="${id}" Name="${esc(name)}" Process="${processRef}" BoundaryVisible="true">
    ${lanesXml}
    <NodeGraphicsInfos>
      <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.pool.border}" FillColor="${C.pool.fill}">
        <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
        ${formatting(10, true)}
      </NodeGraphicsInfo>
    </NodeGraphicsInfos>${milestonesXml}
  </Pool>`
}

function buildSyntheticPool(poolId: string, processRef: string, diagramName: string, shapes: Map<string, Bounds>, phaseGroups: Element[] = []): string {
  const b        = shapes.get(processRef) ?? { x: 30, y: 40, width: 1500, height: 800 }
  const laneId   = crypto.randomUUID()
  const lanesXml = `<Lanes>\n        ${defaultLaneXml(laneId, poolId, b, diagramName)}\n      </Lanes>`
  const milestonesXml = buildMilestones(phaseGroups, poolId, b, shapes, new Map())
  return `<Pool Id="${poolId}" Name="${esc(diagramName)}" Process="${processRef}" BoundaryVisible="true">
    ${lanesXml}
    <NodeGraphicsInfos>
      <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.pool.border}" FillColor="${C.pool.fill}">
        <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
        ${formatting(10, true)}
      </NodeGraphicsInfo>
    </NodeGraphicsInfos>${milestonesXml}
  </Pool>`
}

// ─── WorkflowProcess builder ──────────────────────────────────────────────────

function buildWorkflowProcess(procId: string, procName: string, process: Element, author: string, now: string, parsed: ParsedBpmn): string {
  const { activities, transitions } = buildProcessContent(process, parsed)
  const rtProps = buildRuntimeProperties(procName, now)
  const dataObjectsXml = buildDataObjects(process, parsed)
  return `<WorkflowProcess Id="${procId}" Name="${esc(procName)}">
    <ProcessHeader>
      <Created>${now}</Created>
      <Description />
    </ProcessHeader>
    <RedefinableHeader>
      <Author>${esc(author)}</Author>
      <Version />
      <Countrykey>CO</Countrykey>
    </RedefinableHeader>
    <ActivitySets />
    <DataInputOutputs />
    <Activities>
      ${activities.join('\n      ')}
    </Activities>${dataObjectsXml}
    <Transitions>
      ${transitions.join('\n      ')}
    </Transitions>
    <ExtendedAttributes>
      <ExtendedAttribute Name="RuntimeProperties" Value="${rtProps}" />
    </ExtendedAttributes>
  </WorkflowProcess>`
}

// ─── Artifacts & Associations ─────────────────────────────────────────────────

function buildArtifacts(
  annotations: Element[],
  groups: Element[],
  shapes: Map<string, Bounds>,
  idMap: Map<string, string>,
  categoryValues: Map<string, string>,
): string {
  const parts: string[] = []

  // Los objetos de datos se emiten en el WorkflowProcess (<DataObjects>), no aquí.
  annotations.forEach(el => {
    const origId = el.getAttribute('id') ?? ''
    const id     = uid(idMap, origId)
    const text   = el.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'text')[0]?.textContent ?? ''
    const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 100, height: 60 }
    parts.push(`<Artifact BizAgiArtifactTypeSpecified="false" Id="${id}" ArtifactType="Annotation" TextAnnotation="${esc(text)}">
      <NodeGraphicsInfos>
        <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.annotation.border}" FillColor="${C.annotation.fill}" BorderVisible="false" TextX="${b.x}" TextY="${b.y}" TextWidth="${b.width}" TextHeight="${b.height}">
          <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
          ${formatting()}
          <TextBackgroundColor>${C.white}</TextBackgroundColor>
        </NodeGraphicsInfo>
      </NodeGraphicsInfos>
      <Documentation />
    </Artifact>`)
  })

  groups.forEach(el => {
    const origId = el.getAttribute('id') ?? ''
    const id     = uid(idMap, origId)
    // Nombre: atributo `name` o el del categoryValue referenciado (bpmn-js).
    const name   = el.getAttribute('name')
      || categoryValues.get(el.getAttribute('categoryValueRef') ?? '')
      || ''
    const doc    = el.getElementsByTagNameNS(BPMN_MODEL_NS, 'documentation')[0]?.textContent?.trim() ?? ''
    const b      = shapes.get(origId) ?? { x: 0, y: 0, width: 300, height: 300 }
    const lp     = externalLabel(b, undefined)
    parts.push(`<Artifact BizAgiArtifactTypeSpecified="false" Id="${id}" Name="${esc(name)}" ArtifactType="Group">
      <Group Id="${id}" Name="${esc(name)}" />
      <NodeGraphicsInfos>
        <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="${b.height}" Width="${b.width}" BorderColor="${C.group.border}" FillColor="${C.group.fill}" BorderVisible="false" TextX="${lp.tx}" TextY="${lp.ty}" TextWidth="90" TextHeight="30">
          <Coordinates XCoordinate="${b.x}" YCoordinate="${b.y}" />
          ${formatting()}
          <TextBackgroundColor>${C.white}</TextBackgroundColor>
        </NodeGraphicsInfo>
      </NodeGraphicsInfos>
      ${doc ? `<Documentation>${esc(doc)}</Documentation>` : '<Documentation />'}
    </Artifact>`)
  })

  return parts.join('\n  ')
}

function buildAssociations(
  associations: Element[],
  edges: Map<string, Point[]>,
  idMap: Map<string, string>,
): string {
  return associations.map(el => {
    const origId     = el.getAttribute('id')        ?? ''
    const origSource = el.getAttribute('sourceRef') ?? ''
    const origTarget = el.getAttribute('targetRef') ?? ''
    const id         = uid(idMap, origId)
    const source     = uid(idMap, origSource)
    const target     = uid(idMap, origTarget)
    const wps        = edges.get(origId) ?? []
    const midX       = wps.length >= 2 ? Math.round((wps[0].x + wps[wps.length - 1].x) / 2) : 0
    const midY       = wps.length >= 2 ? Math.round((wps[0].y + wps[wps.length - 1].y) / 2) : 0
    const coords     = wps.map(p => `<Coordinates XCoordinate="${p.x}" YCoordinate="${p.y}" />`).join('\n            ')
    return `<Association Id="${id}" Source="${source}" Target="${target}">
      <ConnectorGraphicsInfos>
        <ConnectorGraphicsInfo ToolId="BizAgi_Process_Modeler" BorderColor="${C.black}" TextX="${midX}" TextY="${midY}">
          ${formatting()}
          <TextBackgroundColor>${C.white}</TextBackgroundColor>
          ${coords}
        </ConnectorGraphicsInfo>
      </ConnectorGraphicsInfos>
      <ExtendedAttributes />
    </Association>`
  }).join('\n  ')
}

function buildMessageFlows(
  messageFlows: Element[],
  edges: Map<string, Point[]>,
  idMap: Map<string, string>,
): string {
  return messageFlows.map(el => {
    const origId     = el.getAttribute('id')        ?? ''
    const origSource = el.getAttribute('sourceRef') ?? ''
    const origTarget = el.getAttribute('targetRef') ?? ''
    const name       = el.getAttribute('name')      ?? ''
    const id         = uid(idMap, origId)
    const source     = uid(idMap, origSource)
    const target     = uid(idMap, origTarget)
    const wps        = edges.get(origId) ?? []
    const midX       = wps.length >= 2 ? Math.round((wps[0].x + wps[wps.length - 1].x) / 2) : 0
    const midY       = wps.length >= 2 ? Math.round((wps[0].y + wps[wps.length - 1].y) / 2) : 0
    const coords     = wps.map(p => `<Coordinates XCoordinate="${p.x}" YCoordinate="${p.y}" />`).join('\n            ')
    return `<MessageFlow Id="${id}" Name="${esc(name)}" Source="${source}" Target="${target}">
      <ConnectorGraphicsInfos>
        <ConnectorGraphicsInfo ToolId="BizAgi_Process_Modeler" BorderColor="${C.black}" TextX="${midX}" TextY="${midY}">
          ${formatting()}
          <TextBackgroundColor>${C.white}</TextBackgroundColor>
          ${coords}
        </ConnectorGraphicsInfo>
      </ConnectorGraphicsInfos>
      <ExtendedAttributes />
    </MessageFlow>`
  }).join('\n  ')
}

// ─── RuntimeProperties JSON ───────────────────────────────────────────────────

function buildRuntimeProperties(processName: string, now: string): string {
  const obj = {
    processClassProperties: {
      displayName:          processName,
      accessType:           'Process',
      order:                1,
      useParentCaseNumber:  true,
      enableAlarms:         true,
      enableNotifications:  true,
      creationDate:         now,
    },
    processProperties: {
      version:             { numberVersion: '1.0', isActive: true },
      versionCreationDate: now,
      supportsScopes:      true,
      caseAccessType:      'Public',
      renderVersion:       2,
      formsVersion:        0,
    },
  }
  return JSON.stringify(obj)
    .replace(/&/g,  '&amp;')
    .replace(/"/g,  '&quot;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
}

// ─── ExtendedAttributeValues ──────────────────────────────────────────────────

function buildExtendedValues(parsed: ParsedBpmn): string {
  const { idMap } = parsed
  const entries: string[] = []

  parsed.participants.forEach(p => {
    const id = uid(idMap, p.getAttribute('id') ?? '')
    entries.push(`  <ElementAttributeValues ElementId="${id}">\n    <Values />\n  </ElementAttributeValues>`)
  })

  parsed.processes.forEach(proc => {
    Array.from(proc.getElementsByTagNameNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'startEvent')).forEach(el => {
      const id = uid(idMap, el.getAttribute('id') ?? '')
      entries.push(`  <ElementAttributeValues ElementId="${id}">\n    <Values />\n  </ElementAttributeValues>`)
    })
  })

  return `<?xml version="1.0" encoding="utf-8"?>
<DiagramAttributeValues xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${entries.join('\n')}
</DiagramAttributeValues>`
}

// ─── Static file builders ─────────────────────────────────────────────────────

function buildModelInfoXml(now: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<BizAgiModelInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" CreationVersion="4.3.0.008" FilePersistenceVersion="5" ModifiedVersion="4.3.0.008" ModifiedDate="${now}" IsInCollaboration="false" />`
}

function buildBPSimXml(author: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ns1:BPSimData simulationLevel="LevelOne" xmlns:ns1="http://www.bpsim.org/schemas/1.0">
  <ns1:Scenario id="Scenario_${crypto.randomUUID()}" name="Escenario 1" author="${esc(author)}" version="1.0">
    <ns1:ScenarioParameters>
      <ns1:PropertyParameters />
    </ns1:ScenarioParameters>
  </ns1:Scenario>
</ns1:BPSimData>`
}

function buildUserPrefsXml(diagIds: string[]): string {
  const items = diagIds
    .map((id, i) => `    <ModelItem ItemType="Diagram" DiagramId="${id}" IsSelected="${i === 0}" />`)
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<UserPreferences xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <OpenedItems>
${items}
  </OpenedItems>
</UserPreferences>`
}

// ─── Ghost "Proceso principal" pool (Bizagi always requires this outer container) ──

function buildGhostPoolXml(now: string): { pool: string; wf: string } {
  const ghostPoolId = crypto.randomUUID()
  const ghostProcId = crypto.randomUUID()
  const rtProps = buildRuntimeProperties('Proceso principal', now)
  const pool = `<Pool Id="${ghostPoolId}" Name="Proceso principal" Process="${ghostProcId}" BoundaryVisible="false">
      <Lanes />
      <NodeGraphicsInfos>
        <NodeGraphicsInfo ToolId="BizAgi_Process_Modeler" Height="0" Width="0" BorderColor="${C.pool.border}" FillColor="${C.pool.fill}">
          <Coordinates XCoordinate="30" YCoordinate="30" />
          ${formatting(10, true)}
        </NodeGraphicsInfo>
      </NodeGraphicsInfos>
    </Pool>`
  const wf = `<WorkflowProcess Id="${ghostProcId}" Name="Proceso principal">
    <ProcessHeader>
      <Created>${now}</Created>
      <Description />
    </ProcessHeader>
    <RedefinableHeader>
      <Author />
      <Version />
      <Countrykey>CO</Countrykey>
    </RedefinableHeader>
    <ActivitySets />
    <DataInputOutputs />
    <ExtendedAttributes>
      <ExtendedAttribute Name="RuntimeProperties" Value="${rtProps}" />
    </ExtendedAttributes>
  </WorkflowProcess>`
  return { pool, wf }
}

// ─── Diagram.xml builder (XPDL 2.2) ──────────────────────────────────────────

function buildDiagramXml(diagUuid: string, diagramName: string, author: string, now: string, parsed: ParsedBpmn): string {
  const { participants, processes, annotations, associations, groups, shapes, idMap } = parsed

  const poolParts: string[] = []
  const wfParts:   string[] = []

  // Bizagi requires a hidden "Proceso principal" outer container as the first Pool/WorkflowProcess.
  const { pool: ghostPool, wf: ghostWf } = buildGhostPoolXml(now)
  poolParts.push(ghostPool)
  wfParts.push(ghostWf)

  // Las fases (Group id `Phase_*`) se exportan como <Milestone> dentro del Pool,
  // NO como <Artifact/Group>. El resto de grupos siguen siendo artefactos.
  const phaseGroups = groups.filter(isPhaseGroup)
  const pureGroups  = groups.filter(g => !isPhaseGroup(g))

  if (participants.length > 0) {
    participants.forEach(participant => {
      const origProcessRef = participant.getAttribute('processRef')
      // Find process element using ORIGINAL id, then use mapped UUID as procId
      const process  = processes.find(p => p.getAttribute('id') === origProcessRef) ?? null
      poolParts.push(buildPool(participant, process, parsed, phaseGroups))
      if (process) {
        const procId   = uid(idMap, process.getAttribute('id') ?? '')
        const procName = participant.getAttribute('name') ?? diagramName
        wfParts.push(buildWorkflowProcess(procId, procName, process, author, now, parsed))
      }
    })
  } else if (processes.length > 0) {
    // No collaboration — synthetic pool wrapping the first process
    const process    = processes[0]
    const origProcId = process.getAttribute('id') ?? ''
    const procId     = uid(idMap, origProcId)
    const synPoolId  = crypto.randomUUID()
    poolParts.push(buildSyntheticPool(synPoolId, procId, diagramName, shapes, phaseGroups))
    wfParts.push(buildWorkflowProcess(procId, diagramName, process, author, now, parsed))
  }

  const artifactsXml    = buildArtifacts(annotations, pureGroups, shapes, idMap, parsed.categoryValues)
  const associationsXml = buildAssociations(associations, parsed.edges, idMap)
  const messageFlowsXml = buildMessageFlows(parsed.messageFlows, parsed.edges, idMap)
  // Solo emitir la sección si hay message flows (evita secciones vacías).
  const messageFlowsSection = parsed.messageFlows.length > 0
    ? `\n  <MessageFlows>\n    ${messageFlowsXml}\n  </MessageFlows>`
    : ''

  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OnlyOneProcess="false" Id="${diagUuid}" Name="${esc(diagramName)}" xmlns="http://www.wfmc.org/2009/XPDL2.2">
  <PackageHeader>
    <XPDLVersion>2.2</XPDLVersion>
    <Vendor>Bizagi Process Modeler.</Vendor>
    <Created>${now}</Created>
    <ModificationDate>${now}</ModificationDate>
    <Description>${esc(diagramName)}</Description>
    <Documentation />
    <CreationVersion>4.3.0.008</CreationVersion>
    <Version>4.3.0.008</Version>
    <Modifications>
      <Modification Date="${now}" UserName="${esc(author)}" />
    </Modifications>
  </PackageHeader>
  <RedefinableHeader>
    <Author>${esc(author)}</Author>
    <Version>1.0</Version>
    <Countrykey>CO</Countrykey>
  </RedefinableHeader>
  <ExternalPackages />
  <Pools>
    ${poolParts.join('\n    ')}
  </Pools>${messageFlowsSection}
  <Associations>
    ${associationsXml}
  </Associations>
  <Artifacts>
    ${artifactsXml}
  </Artifacts>
  <WorkflowProcesses>
    ${wfParts.join('\n    ')}
  </WorkflowProcesses>
  <ExtendedAttributes />
</Package>`
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportToBpm(options: BpmExportOptions): Promise<Blob> {
  const { diagramName, bpmnXml, author = 'user' } = options

  const parsed   = parseBpmnXml(bpmnXml)
  const diagUuid = crypto.randomUUID()
  const now      = new Date().toISOString()

  const diagramXml = buildDiagramXml(diagUuid, diagramName, author, now, parsed)

  // Inner ZIP — the .diag file
  const diagZip = new JSZip()
  diagZip.file('Diagram.xml', diagramXml)
  diagZip.file('Actions.xml', ACTIONS_XML)
  diagZip.file('BPSimData.xml', buildBPSimXml(author))
  diagZip.file('BPSimDataResult.xml', BPSIM_RESULT_XML)
  diagZip.file('ExtendedAttributeValues.xml', buildExtendedValues(parsed))
  const diagBytes = await diagZip.generateAsync({ type: 'uint8array' })

  // Outer ZIP — the .bpm file
  const rootZip = new JSZip()
  rootZip.file('ModelInfo.xml', buildModelInfoXml(now))
  rootZip.file('Participants.xml', PARTICIPANTS_XML)
  rootZip.file('Preferences.bpp', PREFERENCES_BPP)
  rootZip.file('Users/Default/UserPreferences.xml', buildUserPrefsXml([diagUuid]))
  rootZip.file('Users/Default/DocumentationSettings.xml', DOCUMENTATION_SETTINGS_XML)
  rootZip.file('Users/Default/PrintingPreferences.xml', PRINTING_PREFERENCES_XML)
  rootZip.file(`${diagUuid}.diag`, diagBytes, { binary: true })

  return rootZip.generateAsync({ type: 'blob' })
}
