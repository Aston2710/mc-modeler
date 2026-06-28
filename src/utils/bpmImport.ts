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

/** Color de Bizagi (entero ARGB con signo, p.ej. "-986896") → "#RRGGBB". */
function bizagiColorToHex(v: string | null): string | null {
  if (!v) return null
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return null
  const argb = n < 0 ? n >>> 0 : n // a unsigned 32-bit
  const r = (argb >> 16) & 0xff
  const g = (argb >> 8) & 0xff
  const b = argb & 0xff
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Genera un id de fase único (bpmn:group con prefijo Phase_*). */
function newPhaseId(): string {
  const rnd = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
  return `Phase_${rnd.replace(/-/g, '').slice(0, 8)}`
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
  eventDef?: string // eventDefinition BPMN (timer/message/…) si aplica
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
    // Bizagi usa GatewayType en palabras ("Parallel", "Inclusive", "Complex",
    // "Exclusive", "ExclusiveEventBased"...); XPDL clásico usa códigos (AND/OR/XOR).
    const g = (route.getAttribute('GatewayType') ?? route.getAttribute('SplitTypeCode') ?? '').toUpperCase()
    if (g.includes('EVENT')) return 'eventBasedGateway'   // (Exclusive/Parallel)EventBased
    if (g === 'AND' || g === 'PARALLEL') return 'parallelGateway'
    if (g === 'OR' || g === 'INCLUSIVE') return 'inclusiveGateway'
    if (g === 'COMPLEX') return 'complexGateway'
    return 'exclusiveGateway' // XOR / Exclusive / vacío
  }
  // Tarea: detectar subtipo XPDL (<Implementation><Task><TaskXxx/></Task>).
  const task = act.getElementsByTagNameNS(XPDL_NS, 'Task')[0]
  if (task) {
    if (task.getElementsByTagNameNS(XPDL_NS, 'TaskUser')[0]) return 'userTask'
    if (task.getElementsByTagNameNS(XPDL_NS, 'TaskService')[0]) return 'serviceTask'
    if (task.getElementsByTagNameNS(XPDL_NS, 'TaskScript')[0]) return 'scriptTask'
    if (task.getElementsByTagNameNS(XPDL_NS, 'TaskManual')[0]) return 'manualTask'
    if (task.getElementsByTagNameNS(XPDL_NS, 'TaskSend')[0]) return 'sendTask'
    if (task.getElementsByTagNameNS(XPDL_NS, 'TaskReceive')[0]) return 'receiveTask'
    if (task.getElementsByTagNameNS(XPDL_NS, 'TaskBusinessRule')[0]) return 'businessRuleTask'
  }
  return 'task'
}

// Trigger/Result XPDL → eventDefinition BPMN (inverso de EVENT_DEFS del export).
const TRIGGER_TO_DEF: Record<string, string> = {
  Timer: 'timerEventDefinition',
  Message: 'messageEventDefinition',
  Signal: 'signalEventDefinition',
  Error: 'errorEventDefinition',
  Escalation: 'escalationEventDefinition',
  Conditional: 'conditionalEventDefinition',
  Terminate: 'terminateEventDefinition',
  Link: 'linkEventDefinition',
  Compensation: 'compensateEventDefinition',
}

/** Lee el trigger/result del <Event> y devuelve el eventDefinition BPMN (o ''). */
function readEventDef(act: Element): string {
  const ev = act.getElementsByTagNameNS(XPDL_NS, 'Event')[0]
  if (!ev) return ''
  const se = ev.getElementsByTagNameNS(XPDL_NS, 'StartEvent')[0]
  const ie = ev.getElementsByTagNameNS(XPDL_NS, 'IntermediateEvent')[0]
  const ee = ev.getElementsByTagNameNS(XPDL_NS, 'EndEvent')[0]
  const kind = se?.getAttribute('Trigger') ?? ie?.getAttribute('Trigger') ?? ee?.getAttribute('Result') ?? 'None'
  const def = TRIGGER_TO_DEF[kind]
  return def ? `<bpmn:${def} id="${def}_${Math.random().toString(36).slice(2, 8)}" />` : ''
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
  const phaseGroupsXml: string[] = [] // Milestones → fases (bpmn:group Phase_*)
  const knownIds = new Set<string>() // ids ya emitidos (nodos/lanes/artefactos) → validar asociaciones
  const poolBoundsMap: Array<{ bounds: Bounds; procIdx: number }> = []

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
          eventDef: EVENT_TAGS.has(tag) ? readEventDef(act) : '',
        })
      })
    }

    const transitionsParent = wf.getElementsByTagNameNS(XPDL_NS, 'Transitions')[0]
    if (transitionsParent) {
      childrenByTag(transitionsParent, 'Transition').forEach((tr) => {
        const from = tr.getAttribute('From')
        const to = tr.getAttribute('To')
        // Bizagi puede tener conexiones con un extremo sin conectar. Las
        // omitimos: un sequenceFlow con sourceRef/targetRef roto invalida
        // todo el BPMN y bpmn-js rechazaría la importación completa.
        if (!from || !to) return
        const { coords } = readGraphics(tr)
        edges.push({
          id: id(tr.getAttribute('Id')),
          source: id(from),
          target: id(to),
          name: tr.getAttribute('Name') ?? '',
          waypoints: coords,
          tag: 'sequenceFlow',
        })
      })
    }
    return { procId, nodes, edges }
  }

  const emitProcess = (procId: string, lanes: { id: string; name: string; bounds: Bounds }[], nodes: FlowNode[], rawEdges: Edge[]) => {
    nodes.forEach((n) => knownIds.add(n.id))
    lanes.forEach((l) => knownIds.add(l.id))
    // Solo conservar flujos cuyos extremos sean nodos existentes (evita
    // referencias rotas que invalidarían el BPMN).
    const nodeIds = new Set(nodes.map((n) => n.id))
    const edges = rawEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
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
        return `<bpmn:${n.tag} id="${n.id}" name="${esc(n.name)}">${refs}${n.eventDef ?? ''}</bpmn:${n.tag}>`
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
      // Skip Bizagi's invisible outer container pool. BoundaryVisible=false is the primary
      // signal; the secondary check (no Lane children) guards against non-Bizagi XPDL tools
      // that may use BoundaryVisible=false for borderless-but-real pools with content.
      if (pool.getAttribute('BoundaryVisible') === 'false' &&
          pool.querySelectorAll('Lane').length === 0) return
      const poolId = id(pool.getAttribute('Id'))
      knownIds.add(poolId)
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

      // lanes — en XPDL el lane es RELATIVO al pool. Lo posicionamos con la
      // convención de bpmn-js: x = pool.x + 30 (banda del nombre del pool),
      // width = pool.width - 30, y = pool.y + Y_relativo (apilado vertical).
      // Así el lane y su contenido alinean con las fases (que arrancan en pool.x+60).
      const LANE_BAND = 30
      const lpx = poolBounds?.x ?? 0
      const lpy = poolBounds?.y ?? 0
      const pw = poolBounds?.width ?? 600
      const lanes: { id: string; name: string; bounds: Bounds }[] = []
      const lanesParent = pool.getElementsByTagNameNS(XPDL_NS, 'Lanes')[0]
      if (lanesParent) {
        childrenByTag(lanesParent, 'Lane').forEach((lane) => {
          const lid = id(lane.getAttribute('Id'))
          const { bounds } = readGraphics(lane)
          const lb = bounds
            ? { x: lpx + LANE_BAND, y: lpy + bounds.y, width: pw - LANE_BAND, height: bounds.height }
            : (poolBounds ?? { x: 0, y: 0, width: 600, height: 200 })
          lanes.push({ id: lid, name: lane.getAttribute('Name') ?? '', bounds: lb })
          shapesXml.push(
            `<bpmndi:BPMNShape id="${lid}_di" bpmnElement="${lid}" isHorizontal="true"><dc:Bounds x="${lb.x}" y="${lb.y}" width="${lb.width}" height="${lb.height}" /></bpmndi:BPMNShape>`
          )
        })
      }

      // Milestones (Fases) → bpmn:group con id Phase_* + flujo:phaseName.
      // En XPDL las coords del milestone son RELATIVAS al pool → absolutas aquí.
      const msParent = directChild(pool, 'Milestones')
      if (msParent) {
        const px = poolBounds?.x ?? 0
        const py = poolBounds?.y ?? 0
        childrenByTag(msParent, 'Milestone').forEach((ms) => {
          const phaseId = newPhaseId()
          const name = ms.getAttribute('Name') ?? 'Fase'
          const { bounds } = readGraphics(ms)
          const rel = bounds ?? { x: 0, y: 0, width: 300, height: 300 }
          const ax = px + rel.x
          const ay = py + rel.y
          // Color de la fase: FillColor del NodeGraphicsInfo del milestone → hex.
          const giParent = directChild(ms, 'NodeGraphicsInfos')
          const gi = giParent ? directChild(giParent, 'NodeGraphicsInfo') : null
          const hex = gi ? bizagiColorToHex(gi.getAttribute('FillColor')) : null
          const colorAttr = hex ? ` flujo:phaseColor="${hex}"` : ''
          phaseGroupsXml.push(`<bpmn:group id="${phaseId}" flujo:phaseName="${esc(name)}"${colorAttr} />`)
          shapesXml.push(
            `<bpmndi:BPMNShape id="${phaseId}_di" bpmnElement="${phaseId}"><dc:Bounds x="${ax}" y="${ay}" width="${rel.width}" height="${rel.height}" /></bpmndi:BPMNShape>`
          )
        })
      }

      const procIdx = processesXml.length
      emitProcess(procId, lanes, nodes, edges)
      if (poolBounds) poolBoundsMap.push({ bounds: poolBounds, procIdx })
    })
  } else if (workflows.length > 0) {
    // Sin pools: un proceso suelto.
    const wf = workflows[0]
    const { procId, nodes, edges } = buildProcess(wf.getAttribute('Id') ?? '', wf)
    emitProcess(procId, [], nodes, edges)
  }

  // ── Artefactos package-level (Anotaciones, Data Objects, Grupos) ──────────────
  // Se exportan/almacenan a nivel de paquete; los traemos como elementos BPMN y
  // se inyectan en un proceso (bpmn-js los necesita dentro de un <process>).
  // Fix 2: group artifacts by process index using geometric containment
  const artifactsByProc = new Map<number, string[]>()
  const artifactProcMap = new Map<string, number>() // artifact bpmn-id → process index
  const findProcIdx = (b: Bounds | null): number => {
    if (b && poolBoundsMap.length > 0) {
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      for (const entry of poolBoundsMap) {
        if (cx >= entry.bounds.x && cx <= entry.bounds.x + entry.bounds.width &&
            cy >= entry.bounds.y && cy <= entry.bounds.y + entry.bounds.height) {
          return entry.procIdx
        }
      }
    }
    return 0
  }
  const addArtifact = (procIdx: number, el: string, artifactId?: string) => {
    if (!artifactsByProc.has(procIdx)) artifactsByProc.set(procIdx, [])
    artifactsByProc.get(procIdx)!.push(el)
    if (artifactId) artifactProcMap.set(artifactId, procIdx)
  }
  const categoriesXml: string[] = [] // categorías para el nombre de los grupos
  let catSeq = 0
  // <Documentation> del elemento → bpmn:documentation (el "comentario").
  const readDoc = (el: Element): string => {
    const d = directChild(el, 'Documentation')?.textContent?.trim()
    return d ? `<bpmn:documentation>${esc(d)}</bpmn:documentation>` : ''
  }
  const artifactsParent = childrenByTag(pkg, 'Artifacts')[0]
  if (artifactsParent) {
    childrenByTag(artifactsParent, 'Artifact').forEach((art) => {
      const type = art.getAttribute('ArtifactType')
      const aid = id(art.getAttribute('Id'))
      const { bounds } = readGraphics(art)
      const b = bounds ?? { x: 0, y: 0, width: 100, height: 60 }
      const di = `<bpmndi:BPMNShape id="${aid}_di" bpmnElement="${aid}"><dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" /></bpmndi:BPMNShape>`
      const doc = readDoc(art)
      if (type === 'Annotation') {
        const text = art.getAttribute('TextAnnotation') ?? ''
        addArtifact(findProcIdx(b), `<bpmn:textAnnotation id="${aid}">${doc}<bpmn:text>${esc(text)}</bpmn:text></bpmn:textAnnotation>`, aid)
        shapesXml.push(di); knownIds.add(aid)
      } else if (type === 'DataObject') {
        const name = art.getAttribute('Name') ?? ''
        addArtifact(findProcIdx(b), `<bpmn:dataObjectReference id="${aid}" name="${esc(name)}">${doc}</bpmn:dataObjectReference>`, aid)
        shapesXml.push(di); knownIds.add(aid)
      } else if (type === 'Group') {
        // Grupo con nombre (el "comentario" visible). bpmn-js muestra la etiqueta
        // del grupo vía categoryValueRef → category/categoryValue.
        const name = art.getAttribute('Name') ?? ''
        let catRef = ''
        if (name) {
          const cvId = `CategoryValue_${catSeq}`
          categoriesXml.push(`<bpmn:category id="Category_${catSeq}"><bpmn:categoryValue id="${cvId}" value="${esc(name)}" /></bpmn:category>`)
          catRef = ` categoryValueRef="${cvId}"`
          catSeq++
        }
        addArtifact(findProcIdx(b), `<bpmn:group id="${aid}"${catRef}>${doc}</bpmn:group>`, aid)
        shapesXml.push(di); knownIds.add(aid)
      }
    })
  }

  // ── Data Objects: Bizagi los guarda en <DataObjects><DataObject Id Name> dentro
  // del WorkflowProcess (NO como Artifact). Los traemos como dataObjectReference
  // (con su dataObject para que el BPMN sea válido) y su nombre.
  let dataSeq = 0
  childrenByTag(pkg, 'DataObject').forEach((dobj) => {
    const oid = id(dobj.getAttribute('Id'))
    const name = dobj.getAttribute('Name') ?? ''
    const { bounds } = readGraphics(dobj)
    const b = bounds ?? { x: 0, y: 0, width: 36, height: 50 }
    const objEl = directChild(dobj, 'Object')
    const doc = objEl ? readDoc(objEl) : readDoc(dobj)
    const doId = `DataObject_${dataSeq++}`
    addArtifact(findProcIdx(b), `<bpmn:dataObject id="${doId}" />`)
    addArtifact(findProcIdx(b), `<bpmn:dataObjectReference id="${oid}" name="${esc(name)}" dataObjectRef="${doId}">${doc}</bpmn:dataObjectReference>`)
    shapesXml.push(`<bpmndi:BPMNShape id="${oid}_di" bpmnElement="${oid}"><dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" /></bpmndi:BPMNShape>`)
    knownIds.add(oid)
  })

  // ── Asociaciones (texto/datos ↔ flujo) ────────────────────────────────────────
  const assocParent = childrenByTag(pkg, 'Associations')[0]
  if (assocParent) {
    childrenByTag(assocParent, 'Association').forEach((assoc) => {
      const aid = id(assoc.getAttribute('Id'))
      const src = id(assoc.getAttribute('Source'))
      const tgt = id(assoc.getAttribute('Target'))
      // Ambos extremos deben existir o bpmn-js rechaza todo el import.
      if (!knownIds.has(src) || !knownIds.has(tgt)) return
      const assocProcIdx = artifactProcMap.get(src) ?? artifactProcMap.get(tgt) ?? 0
      addArtifact(assocProcIdx, `<bpmn:association id="${aid}" sourceRef="${src}" targetRef="${tgt}" />`)
      const { coords } = readGraphics(assoc)
      const wps = coords.length >= 2 ? coords.map((p) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join('') : ''
      edgesXml.push(`<bpmndi:BPMNEdge id="${aid}_di" bpmnElement="${aid}">${wps}</bpmndi:BPMNEdge>`)
    })
  }

  // Inyectar artefactos en el proceso correcto según contención geométrica (Fix 2).
  if (artifactsByProc.size > 0) {
    if (processesXml.length === 0) {
      const allEls = Array.from(artifactsByProc.values()).flat()
      processesXml.push(`<bpmn:process id="Process_artifacts" isExecutable="false">${allEls.join('')}</bpmn:process>`)
    } else {
      artifactsByProc.forEach((els, pi) => {
        const idx = Math.min(pi, processesXml.length - 1)
        processesXml[idx] = processesXml[idx].replace('</bpmn:process>', `${els.join('')}</bpmn:process>`)
      })
    }
  }

  // ── Message flows (entre pools) → bpmn:messageFlow en la collaboration ─────────
  const messageFlowsXml: string[] = []
  const mfParent = childrenByTag(pkg, 'MessageFlows')[0]
  if (mfParent) {
    childrenByTag(mfParent, 'MessageFlow').forEach((mf) => {
      const mid = id(mf.getAttribute('Id'))
      const src = id(mf.getAttribute('Source'))
      const tgt = id(mf.getAttribute('Target'))
      const name = mf.getAttribute('Name') ?? ''
      if (!knownIds.has(src) || !knownIds.has(tgt)) return
      messageFlowsXml.push(`<bpmn:messageFlow id="${mid}" name="${esc(name)}" sourceRef="${src}" targetRef="${tgt}" />`)
      const { coords } = readGraphics(mf)
      const wps = coords.length >= 2 ? coords.map((p) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join('') : ''
      edgesXml.push(`<bpmndi:BPMNEdge id="${mid}_di" bpmnElement="${mid}">${wps}</bpmndi:BPMNEdge>`)
    })
  }

  const planeElement = pools.length > 0 ? 'Collaboration_1' : (processesXml.length ? /process id="([^"]+)"/.exec(processesXml[0])?.[1] ?? 'Process_1' : 'Process_1')

  const collaboration =
    participantsXml.length > 0
      ? `<bpmn:collaboration id="Collaboration_1">${participantsXml.join('')}${phaseGroupsXml.join('')}${messageFlowsXml.join('')}</bpmn:collaboration>`
      : ''

  void fallbackName

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:flujo="http://flujo.app/schema/bpmn"
  id="Definitions_imported"
  targetNamespace="http://bpmn.io/schema/bpmn">
  ${collaboration}
  ${categoriesXml.join('\n  ')}
  ${processesXml.join('\n  ')}
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${planeElement}">
      ${shapesXml.join('\n      ')}
      ${edgesXml.join('\n      ')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`
}

/** Lee el Diagram.xml (XPDL) de un .diag (ZIP interior). */
async function readDiagramXml(diagBytes: Uint8Array): Promise<string | null> {
  try {
    const inner = await JSZip.loadAsync(diagBytes)
    const file = inner.file('Diagram.xml') ?? Object.values(inner.files).find((f) => /Diagram\.xml$/i.test(f.name))
    return file ? await file.async('string') : null
  } catch {
    return null
  }
}

function countActivities(xpdl: string): number {
  return (xpdl.match(/<Activity\b/g) ?? []).length
}

function packageName(xpdl: string): string | null {
  return /<Package\b[^>]*\bName="([^"]*)"/.exec(xpdl)?.[1] ?? null
}

/**
 * Descomprime un archivo .bpm de Bizagi y devuelve el BPMN 2.0 equivalente.
 *
 * Un .bpm es un proyecto que puede contener VARIOS .diag (procesos y
 * subprocesos). Se elige el diagrama con más contenido (más actividades) como
 * el principal — varios .diag suelen estar vacíos (subprocesos sin detallar).
 *
 * @param buffer Contenido binario del .bpm (ArrayBuffer).
 * @returns { xml, name } del diagrama principal.
 */
export async function importBpm(
  buffer: ArrayBuffer,
  fallbackName = 'Diagrama'
): Promise<{ xml: string; name: string }> {
  const outer = await JSZip.loadAsync(buffer)

  const diagEntries = Object.values(outer.files).filter((f) => /\.diag$/i.test(f.name) && !f.dir)
  if (diagEntries.length === 0) throw new Error('Archivo .bpm inválido: no contiene ningún .diag')

  // Leer todos los Diagram.xml y elegir el de más actividades.
  let best: { xpdl: string; activities: number } | null = null
  for (const entry of diagEntries) {
    const bytes = await entry.async('uint8array')
    const xpdl = await readDiagramXml(bytes)
    if (!xpdl) continue
    const activities = countActivities(xpdl)
    if (!best || activities > best.activities) best = { xpdl, activities }
  }

  if (!best) throw new Error('Archivo .bpm inválido: ningún .diag contiene Diagram.xml')

  const name = packageName(best.xpdl) || fallbackName
  return { xml: xpdlToBpmn(best.xpdl, name), name }
}
