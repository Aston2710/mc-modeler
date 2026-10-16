import { BpmnModdle } from 'bpmn-moddle'
import flujoModdle from '../../bpmn/moddle/flujo.json'
import { trazarConexiones, type ConexionATrazar, type FormaParaTrazar } from './trazado'
import { disponerModelo, type Caja } from './layout'
import {
  DEFINICION_BPMN,
  LIMITES,
  TIPO_BPMN,
  type FlujoSemantico,
  type ModeloSemantico,
  type NodoSemantico,
} from './modelo'
import { validarModelo } from './validarModelo'

/**
 * Del modelo semántico al XML BPMN que se guarda en `diagrams.current_xml`.
 *
 * Usa `bpmn-moddle` con la extensión `flujo` de la app, igual que
 * `normalizeBpmnXml` y que el `saveXML` del modeler: el XML resultante es del
 * mismo dialecto que el que escribe el cliente (incluido EXP-018, que se
 * hereda a propósito para no fabricar un tercer dialecto).
 */

export class ErrorModelo extends Error {
  constructor(public readonly errores: string[]) {
    super(`el modelo no es válido: ${errores.join('; ')}`)
    this.name = 'ErrorModelo'
  }
}

export interface DiagramaGenerado {
  xml: string
  /** Recuento real de elementos BPMN (pools, carriles, nodos y flujos). */
  elementos: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bo = any

export function crearModdle(): Bo {
  return new BpmnModdle({ flujo: flujoModdle })
}

export async function construirXml(modelo: ModeloSemantico): Promise<DiagramaGenerado> {
  const { errores } = validarModelo(modelo)
  if (errores.length) throw new ErrorModelo(errores)

  const layout = disponerModelo(modelo)
  const moddle = crearModdle()
  const usados = new Set<string>()
  const reservar = (base: string) => {
    let id = base
    for (let i = 2; usados.has(id); i++) id = `${base}_${i}`
    usados.add(id)
    return id
  }
  // Los ids del modelo primero: son los que la IA usará para referirse a todo.
  for (const p of modelo.pools) {
    usados.add(p.id)
    for (const c of p.carriles ?? []) usados.add(c.id)
  }
  const marcarNodos = (lista?: NodoSemantico[]) => {
    for (const n of lista ?? []) { usados.add(n.id); marcarNodos(n.nodos) }
  }
  modelo.pools.forEach((p) => marcarNodos(p.nodos))
  for (const f of [...(modelo.flujos ?? []), ...(modelo.mensajes ?? [])]) if (f.id) usados.add(f.id)

  const bos = new Map<string, Bo>()
  const contenedorDe = new Map<string, Bo>()
  const shapes: Bo[] = []
  const formas = new Map<string, FormaParaTrazar>()
  const caja = (id: string): Caja => {
    const c = layout.nodos.get(id) ?? layout.pools.get(id) ?? layout.carriles.get(id)
    if (!c) throw new Error(`sin posición para ${id}`)
    return c
  }
  const shape = (bo: Bo, extra: Record<string, unknown> = {}) => {
    const c = caja(bo.id)
    shapes.push(moddle.create('bpmndi:BPMNShape', {
      id: reservar(`${bo.id}_di`),
      bpmnElement: bo,
      bounds: moddle.create('dc:Bounds', { x: c.x, y: c.y, width: c.width, height: c.height }),
      ...extra,
    }))
    formas.set(bo.id, { id: bo.id, ...c, businessObject: bo, incoming: [], outgoing: [] })
  }

  const definitions = moddle.create('bpmn:Definitions', {
    id: reservar('Definitions_1'),
    targetNamespace: 'http://bpmn.io/schema/bpmn',
    rootElements: [],
  })
  const collaboration = moddle.create('bpmn:Collaboration', {
    id: reservar('Collaboration_1'),
    participants: [],
    messageFlows: [],
  })
  definitions.rootElements.push(collaboration)

  const crearNodo = (n: NodoSemantico, contenedor: Bo) => {
    const bo = moddle.create(TIPO_BPMN[n.tipo], { id: n.id })
    if (n.nombre) bo.name = n.nombre
    if (n.evento) {
      bo.eventDefinitions = [moddle.create(DEFINICION_BPMN[n.evento], { id: reservar(`${n.id}_def`) })]
    }
    if (n.tipo === 'subproceso') {
      bo.flowElements = []
      for (const hijo of n.nodos ?? []) crearNodo(hijo, bo)
    }
    contenedor.flowElements.push(bo)
    bos.set(n.id, bo)
    contenedorDe.set(n.id, contenedor)
  }

  for (const pool of modelo.pools) {
    const process = moddle.create('bpmn:Process', {
      id: reservar(`Process_${pool.id}`),
      isExecutable: false,
      flowElements: [],
    })
    definitions.rootElements.push(process)
    const participant = moddle.create('bpmn:Participant', {
      id: pool.id,
      name: pool.nombre,
      processRef: process,
    })
    collaboration.participants.push(participant)
    bos.set(pool.id, participant)
    for (const n of pool.nodos) crearNodo(n, process)

    if (pool.carriles?.length) {
      const lanes = pool.carriles.map((c) => {
        const lane = moddle.create('bpmn:Lane', { id: c.id, name: c.nombre, flowNodeRef: [] })
        bos.set(c.id, lane)
        return lane
      })
      process.laneSets = [moddle.create('bpmn:LaneSet', { id: reservar(`LaneSet_${pool.id}`), lanes })]
      for (const n of pool.nodos) {
        const lane = lanes.find((l: Bo) => l.id === n.carril)
        if (!lane) continue
        lane.flowNodeRef.push(bos.get(n.id))
        // El contenido de un subproceso pertenece al carril del subproceso.
        const anidar = (lista?: NodoSemantico[]) => {
          for (const h of lista ?? []) { lane.flowNodeRef.push(bos.get(h.id)); anidar(h.nodos) }
        }
        anidar(n.nodos)
      }
    }
  }

  // Eventos de borde: referencia a su anfitrión.
  const enlazarBordes = (lista?: NodoSemantico[]) => {
    for (const n of lista ?? []) {
      if (n.tipo === 'evento_borde' && n.adjunto_a) {
        const bo = bos.get(n.id)
        bo.attachedToRef = bos.get(n.adjunto_a)
        if (n.interrumpe === false) bo.cancelActivity = false
      }
      enlazarBordes(n.nodos)
    }
  }
  modelo.pools.forEach((p) => enlazarBordes(p.nodos))

  // ── Flujos ──
  const conexiones: ConexionATrazar[] = []
  let n = 0
  const idFlujo = (f: FlujoSemantico, prefijo: string) => f.id ?? reservar(`${prefijo}_${++n}`)

  for (const f of modelo.flujos ?? []) {
    const source = bos.get(f.desde)
    const target = bos.get(f.hasta)
    const flow = moddle.create('bpmn:SequenceFlow', { id: idFlujo(f, 'Flow'), sourceRef: source, targetRef: target })
    if (f.nombre) flow.name = f.nombre
    contenedorDe.get(f.desde).flowElements.push(flow)
    ;(source.outgoing ??= []).push(flow)
    ;(target.incoming ??= []).push(flow)
    conexiones.push({ bo: flow, desde: f.desde, hasta: f.hasta })
  }
  for (const m of modelo.mensajes ?? []) {
    const flow = moddle.create('bpmn:MessageFlow', {
      id: idFlujo(m, 'MessageFlow'),
      sourceRef: bos.get(m.desde),
      targetRef: bos.get(m.hasta),
    })
    if (m.nombre) flow.name = m.nombre
    collaboration.messageFlows.push(flow)
    conexiones.push({ bo: flow, desde: m.desde, hasta: m.hasta })
  }

  // ── DI: formas ──
  for (const pool of modelo.pools) {
    shape(bos.get(pool.id), { isHorizontal: true })
    for (const c of pool.carriles ?? []) shape(bos.get(c.id), { isHorizontal: true })
  }
  const formasNodos = (lista?: NodoSemantico[]) => {
    for (const nodo of lista ?? []) {
      shape(bos.get(nodo.id), nodo.tipo === 'subproceso' ? { isExpanded: true } : {})
      formasNodos(nodo.nodos)
    }
  }
  modelo.pools.forEach((p) => formasNodos(p.nodos))
  for (const nodo of modelo.pools.flatMap((p) => p.nodos)) enlazarAnfitrion(nodo)
  function enlazarAnfitrion(nodo: NodoSemantico) {
    if (nodo.tipo === 'evento_borde' && nodo.adjunto_a) {
      formas.get(nodo.id)!.host = formas.get(nodo.adjunto_a)
    }
    nodo.nodos?.forEach(enlazarAnfitrion)
  }

  // ── DI: aristas, trazadas con el layouter del cliente ──
  const trazos = trazarConexiones([...formas.values()], conexiones)
  const edges = conexiones.map((c) =>
    moddle.create('bpmndi:BPMNEdge', {
      id: reservar(`${c.bo.id}_di`),
      bpmnElement: c.bo,
      waypoint: trazos.get(c.bo.id)!.map((p) => moddle.create('dc:Point', { x: p.x, y: p.y })),
    })
  )

  definitions.diagrams = [moddle.create('bpmndi:BPMNDiagram', {
    id: reservar('BPMNDiagram_1'),
    plane: moddle.create('bpmndi:BPMNPlane', {
      id: reservar('BPMNPlane_1'),
      bpmnElement: collaboration,
      planeElement: [...shapes, ...edges],
    }),
  })]

  const { xml } = await moddle.toXML(definitions, { format: true })
  if (new TextEncoder().encode(xml).length > LIMITES.MAX_BYTES_XML) {
    throw new ErrorModelo([`el XML generado supera ${LIMITES.MAX_BYTES_XML} bytes`])
  }
  // Releer lo que se acaba de escribir: si moddle no lo entiende sin avisos,
  // tampoco lo abriría la app (EXP-022: el guardado es todo o nada).
  const { warnings } = await crearModdle().fromXML(xml)
  if (warnings.length) {
    throw new Error(`el XML generado no se relee limpio: ${warnings.map((w: Bo) => w.message).join('; ')}`)
  }

  const elementos =
    modelo.pools.length +
    modelo.pools.reduce((s, p) => s + (p.carriles?.length ?? 0), 0) +
    layout.nodos.size +
    conexiones.length
  return { xml, elementos }
}
