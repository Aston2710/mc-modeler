import JSZip from 'jszip'

/**
 * Importador de archivos .bpm de Bizagi Modeler → BPMN 2.0.
 *
 * Estructura de un .bpm (inverso de exportToBpm en bpmExport.ts):
 *   .bpm           = ZIP exterior
 *     └── <uuid>.diag = ZIP interior
 *           └── Diagram.xml  (XPDL 2.2, ns http://www.wfmc.org/2009/XPDL2.2)
 *
 * Convierte el XPDL al subconjunto BPMN que la app entiende. Los elementos no
 * soportados se omiten sin abortar la importación.
 */

const XPDL_NS = 'http://www.wfmc.org/2009/XPDL2.2'

interface Bounds { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }

// ── ID helper: GUID de Bizagi → NCName válido para BPMN ──────────────────────
function makeIdMapper() {
  const map = new Map<string, string>()
  return (raw: string | null | undefined): string => {
    const key = raw ?? ''
    if (!key) return `n_${Math.random().toString(36).slice(2, 10)}`
    let id = map.get(key)
    if (!id) {
      // NCName no puede empezar por dígito; prefijar y limpiar guiones.
      id = `n_${key.replace(/[^a-zA-Z0-9]/g, '')}`
      map.set(key, id)
    }
    return id
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function childrenByTag(parent: Element, tag: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(XPDL_NS, tag))
}

/** Primer descendiente directo con ese tag (no recursivo), evitando coger
 *  el graphics de un hijo anidado (p. ej. el NodeGraphicsInfo de una Lane
 *  cuando se pregunta por el del Pool). */
function directChild(parent: Element, tag: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === tag) return child
  }
  return null
}

function readGraphics(el: Element): { bounds: Bounds | null; coords: Point[] } {
  // Buscar el contenedor de graphics como hijo directo (NodeGraphicsInfos /
  // ConnectorGraphicsInfos), no recursivamente.
  const nodeInfos = directChild(el, 'NodeGraphicsInfos')
  const connInfos = directChild(el, 'ConnectorGraphicsInfos')
  // NodeGraphicsInfo → bounds; ConnectorGraphicsInfo → lista de coordenadas.
  const node = nodeInfos ? directChild(nodeInfos, 'NodeGraphicsInfo') : null
  if (node) {
    const c = node.getElementsByTagNameNS(XPDL_NS, 'Coordinates')[0]
    const x = c ? parseFloat(c.getAttribute('XCoordinate') ?? '0') : 0
    const y = c ? parseFloat(c.getAttribute('YCoordinate') ?? '0') : 0
    const width = parseFloat(node.getAttribute('Width') ?? '100')
    const height = parseFloat(node.getAttribute('Height') ?? '80')
    return { bounds: { x, y, width, height }, coords: [] }
  }
  const conn = connInfos ? directChild(connInfos, 'ConnectorGraphicsInfo') : null
  if (conn) {
    const coords = Array.from(conn.getElementsByTagNameNS(XPDL_NS, 'Coordinates')).map((p) => ({
      x: parseFloat(p.getAttribute('XCoordinate') ?? '0'),
      y: parseFloat(p.getAttribute('YCoordinate') ?? '0'),
    }))
    return { bounds: null, coords }
  }
  return { bounds: null, coords: [] }
}

interface FlowNode {
  id: string
  tag: string // bpmn tag, p.ej. 'task', 'startEvent'
  name: string
  bounds: Bounds
}

interface Edge {
  id: string
  source: string
  target: string
  name: string
  waypoints: Point[]
  tag: 'sequenceFlow' | 'association'
}

/** Clasifica un <Activity> XPDL al tag BPMN correspondiente. */
function classifyActivity(act: Element): string {
  const event = act.getElementsByTagNameNS(XPDL_NS, 'Event')[0]
  if (event) {
    if (event.getElementsByTagNameNS(XPDL_NS, 'StartEvent')[0]) return 'startEvent'
    if (event.getElementsByTagNameNS(XPDL_NS, 'EndEvent')[0]) return 'endEvent'
    return 'intermediateCatchEvent'
  }
  const route = act.getElementsByTagNameNS(XPDL_NS, 'Route')[0]
  if (route) {
    const split = (route.getAttribute('SplitTypeCode') ?? route.getAttribute('GatewayType') ?? 'XOR').toUpperCase()
    if (split === 'AND') return 'parallelGateway'
    if (split === 'OR') return 'inclusiveGateway'
    return 'exclusiveGateway'
  }
  // Implementation/Task u otros → tarea
  return 'task'
}

const EVENT_TAGS = new Set(['startEvent', 'endEvent', 'intermediateCatchEvent'])
const GATEWAY_TAGS = new Set(['exclusiveGateway', 'parallelGateway', 'inclusiveGateway'])

function defaultSizeFor(tag: string): { width: number; height: number } {
  if (EVENT_TAGS.has(tag)) return { width: 36, height: 36 }
  if (GATEWAY_TAGS.has(tag)) return { width: 50, height: 50 }
  return { width: 100, height: 80 }
}

/** Convierte el XML XPDL (Diagram.xml) a BPMN 2.0. */
export function xpdlToBpmn(xpdlXml: string, fallbackName = 'Diagrama'): string {
  const doc = new DOMParser().parseFromString(xpdlXml, 'text/xml')
  const id = makeIdMapper()

  const pkg = doc.documentElement
  const pools = childrenByTag(pkg, 'Pool')
  const workflows = childrenByTag(pkg, 'WorkflowProcess')

  // Mapa processRef(Bizagi) → WorkflowProcess element
  const wfByProcess = new Map<string, Element>()
  workflows.forEach((wf) => wfByProcess.set(wf.getAttribute('Id') ?? '', wf))

  const shapesXml: string[] = []
  const edgesXml: string[] = []
  const participantsXml: string[] = []
  const processesXml: string[] = []

  const buildProcess = (procBizId: string, wf: Element | undefined): { procId: string; nodes: FlowNode[]; edges: Edge[] } => {
    const procId = id(procBizId || `proc_${Math.random().toString(36).slice(2, 8)}`)
    const nodes: FlowNode[] = []
    const edges: Edge[] = []
    if (!wf) return { procId, nodes, edges }

    const activitiesParent = wf.getElementsByTagNameNS(XPDL_NS, 'Activities')[0]
    if (activitiesParent) {
      childrenByTag(activitiesParent, 'Activity').forEach((act) => {
        const tag = classifyActivity(act)
        const { bounds } = readGraphics(act)
        const size = defaultSizeFor(tag)
        nodes.push({
          id: id(act.getAttribute('Id')),
          tag,
          name: act.getAttribute('Name') ?? '',
          bounds: bounds ?? { x: 100, y: 100, ...size },
        })
      })
    }

    const transitionsParent = wf.getElementsByTagNameNS(XPDL_NS, 'Transitions')[0]
    if (transitionsParent) {
      childrenByTag(transitionsParent, 'Transition').forEach((tr) => {
        const { coords } = readGraphics(tr)
        edges.push({
          id: id(tr.getAttribute('Id')),
          source: id(tr.getAttribute('From')),
          target: id(tr.getAttribute('To')),
          name: tr.getAttribute('Name') ?? '',
          waypoints: coords,
          tag: 'sequenceFlow',
        })
      })
    }
    return { procId, nodes, edges }
  }

  const emitProcess = (procId: string, lanes: { id: string; name: string; bounds: Bounds }[], nodes: FlowNode[], edges: Edge[]) => {
    const laneSet =
      lanes.length > 0
        ? `<bpmn:laneSet id="LaneSet_${procId}">` +
          lanes
            .map((ln) => {
              // flowNodeRef por contención geométrica
              const refs = nodes
                .filter((n) => {
                  const cx = n.bounds.x + n.bounds.width / 2
                  const cy = n.bounds.y + n.bounds.height / 2
                  return cx >= ln.bounds.x && cx <= ln.bounds.x + ln.bounds.width &&
                         cy >= ln.bounds.y && cy <= ln.bounds.y + ln.bounds.height
                })
                .map((n) => `<bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`)
                .join('')
              return `<bpmn:lane id="${ln.id}" name="${esc(ln.name)}">${refs}</bpmn:lane>`
            })
            .join('') +
          `</bpmn:laneSet>`
        : ''

    const flowNodes = nodes
      .map((n) => {
        const refs =
          n.tag === 'sequenceFlow'
            ? ''
            : edges
                .filter((e) => e.tag === 'sequenceFlow' && (e.source === n.id || e.target === n.id))
                .map((e) =>
                  e.source === n.id
                    ? `<bpmn:outgoing>${e.id}</bpmn:outgoing>`
                    : `<bpmn:incoming>${e.id}</bpmn:incoming>`
                )
                .join('')
        return `<bpmn:${n.tag} id="${n.id}" name="${esc(n.name)}">${refs}</bpmn:${n.tag}>`
      })
      .join('')

    const flows = edges
      .filter((e) => e.tag === 'sequenceFlow')
      .map((e) => `<bpmn:sequenceFlow id="${e.id}" name="${esc(e.name)}" sourceRef="${e.source}" targetRef="${e.target}" />`)
      .join('')

    processesXml.push(`<bpmn:process id="${procId}" isExecutable="false">${laneSet}${flowNodes}${flows}</bpmn:process>`)

    // DI de flow nodes
    nodes.forEach((n) => {
      shapesXml.push(
        `<bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"><dc:Bounds x="${n.bounds.x}" y="${n.bounds.y}" width="${n.bounds.width}" height="${n.bounds.height}" /></bpmndi:BPMNShape>`
      )
    })
    // DI de edges
    edges.forEach((e) => {
      const wps =
        e.waypoints.length >= 2
          ? e.waypoints.map((p) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join('')
          : ''
      edgesXml.push(`<bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">${wps}</bpmndi:BPMNEdge>`)
    })
  }

  if (pools.length > 0) {
    pools.forEach((pool) => {
      const poolId = id(pool.getAttribute('Id'))
      const poolName = pool.getAttribute('Name') ?? ''
      const procBizId = pool.getAttribute('Process') ?? ''
      const wf = wfByProcess.get(procBizId)
      const { procId, nodes, edges } = buildProcess(procBizId, wf)

      participantsXml.push(`<bpmn:participant id="${poolId}" name="${esc(poolName)}" processRef="${procId}" />`)

      const { bounds: poolBounds } = readGraphics(pool)
      if (poolBounds) {
        shapesXml.push(
          `<bpmndi:BPMNShape id="${poolId}_di" bpmnElement="${poolId}" isHorizontal="true"><dc:Bounds x="${poolBounds.x}" y="${poolBounds.y}" width="${poolBounds.width}" height="${poolBounds.height}" /></bpmndi:BPMNShape>`
        )
      }

      // lanes
      const lanes: { id: string; name: string; bounds: Bounds }[] = []
      const lanesParent = pool.getElementsByTagNameNS(XPDL_NS, 'Lanes')[0]
      if (lanesParent) {
        childrenByTag(lanesParent, 'Lane').forEach((lane) => {
          const lid = id(lane.getAttribute('Id'))
          const { bounds } = readGraphics(lane)
          const lb = bounds ?? poolBounds ?? { x: 0, y: 0, width: 600, height: 200 }
          lanes.push({ id: lid, name: lane.getAttribute('Name') ?? '', bounds: lb })
          shapesXml.push(
            `<bpmndi:BPMNShape id="${lid}_di" bpmnElement="${lid}" isHorizontal="true"><dc:Bounds x="${lb.x}" y="${lb.y}" width="${lb.width}" height="${lb.height}" /></bpmndi:BPMNShape>`
          )
        })
      }
      emitProcess(procId, lanes, nodes, edges)
    })
  } else if (workflows.length > 0) {
    // Sin pools: un proceso suelto.
    const wf = workflows[0]
    const { procId, nodes, edges } = buildProcess(wf.getAttribute('Id') ?? '', wf)
    emitProcess(procId, [], nodes, edges)
  }

  const planeElement = pools.length > 0 ? 'Collaboration_1' : (processesXml.length ? /process id="([^"]+)"/.exec(processesXml[0])?.[1] ?? 'Process_1' : 'Process_1')

  const collaboration =
    participantsXml.length > 0
      ? `<bpmn:collaboration id="Collaboration_1">${participantsXml.join('')}</bpmn:collaboration>`
      : ''

  void fallbackName

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_imported"
  targetNamespace="http://bpmn.io/schema/bpmn">
  ${collaboration}
  ${processesXml.join('\n  ')}
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${planeElement}">
      ${shapesXml.join('\n      ')}
      ${edgesXml.join('\n      ')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`
}

/**
 * Descomprime un archivo .bpm de Bizagi y devuelve el BPMN 2.0 equivalente.
 * @param buffer Contenido binario del .bpm (ArrayBuffer).
 */
export async function importBpm(buffer: ArrayBuffer, fallbackName = 'Diagrama'): Promise<string> {
  const outer = await JSZip.loadAsync(buffer)

  // 1) localizar el .diag (ZIP interior)
  const diagEntry = Object.values(outer.files).find((f) => /\.diag$/i.test(f.name))
  if (!diagEntry) throw new Error('Archivo .bpm inválido: no contiene un .diag')

  const diagBytes = await diagEntry.async('uint8array')
  const inner = await JSZip.loadAsync(diagBytes)

  // 2) leer Diagram.xml (XPDL)
  const diagramFile = inner.file('Diagram.xml') ?? Object.values(inner.files).find((f) => /Diagram\.xml$/i.test(f.name))
  if (!diagramFile) throw new Error('Archivo .bpm inválido: falta Diagram.xml')

  const xpdl = await diagramFile.async('string')
  return xpdlToBpmn(xpdl, fallbackName)
}
