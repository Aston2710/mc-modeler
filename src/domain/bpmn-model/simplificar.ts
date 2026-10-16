import { crearModdle } from './construirXml'
import {
  DEFINICION_SEMANTICA,
  TIPO_SEMANTICO,
  type DefinicionEvento,
  type TipoNodo,
} from './modelo'

/**
 * Del XML guardado a una estructura que una IA puede leer sin parsear BPMN:
 * pools, carriles, nodos, flujos y mensajes, con sus ids y nombres. Es lo que
 * devuelve `obtener_diagrama`, y tiene la misma forma que la entrada de
 * `crear_diagrama`, así que sirve para copiar o rehacer un diagrama.
 *
 * Lo que no tiene equivalente semántico (anotaciones, grupos, objetos de
 * datos, actividades de llamada…) no se pierde ni se inventa: se lista en
 * `otros` con su tipo BPMN, para que la IA sepa que está ahí.
 */

export interface NodoSimplificado {
  id: string
  tipo: TipoNodo
  nombre?: string
  carril?: string
  evento?: DefinicionEvento
  adjunto_a?: string
  interrumpe?: boolean
  nodos?: NodoSimplificado[]
}

export interface PoolSimplificado {
  id: string
  nombre: string
  /** true si el diagrama no tiene pool y este representa el proceso suelto. */
  sin_pool?: boolean
  carriles: { id: string; nombre: string }[]
  nodos: NodoSimplificado[]
}

export interface FlujoSimplificado {
  id: string
  desde: string
  hasta: string
  nombre?: string
}

export interface ElementoOtro {
  id: string
  tipo_bpmn: string
  nombre?: string
  dentro_de?: string
}

export interface DiagramaSimplificado {
  pools: PoolSimplificado[]
  flujos: FlujoSimplificado[]
  mensajes: FlujoSimplificado[]
  otros: ElementoOtro[]
  /** Avisos del parser: si no está vacío, hay partes que no se entendieron. */
  avisos_lectura: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bo = any

export async function simplificar(xml: string): Promise<DiagramaSimplificado> {
  const { rootElement: defs, warnings } = await crearModdle().fromXML(xml)
  const salida: DiagramaSimplificado = {
    pools: [],
    flujos: [],
    mensajes: [],
    otros: [],
    avisos_lectura: warnings.map((w: Bo) => String(w.message)),
  }

  const carrilDe = new Map<string, string>()
  const nombre = (bo: Bo) => (bo.name ? { nombre: String(bo.name) } : {})

  const nodosDe = (contenedor: Bo, dentroDe?: string): NodoSimplificado[] => {
    const lista: NodoSimplificado[] = []
    for (const el of contenedor.flowElements ?? []) {
      if (el.$type === 'bpmn:SequenceFlow') {
        salida.flujos.push({ id: el.id, desde: el.sourceRef?.id, hasta: el.targetRef?.id, ...nombre(el) })
        continue
      }
      const tipo = TIPO_SEMANTICO[el.$type]
      if (!tipo) {
        salida.otros.push({ id: el.id, tipo_bpmn: el.$type, ...nombre(el), ...(dentroDe ? { dentro_de: dentroDe } : {}) })
        continue
      }
      const nodo: NodoSimplificado = { id: el.id, tipo, ...nombre(el) }
      const carril = carrilDe.get(el.id)
      if (carril && !dentroDe) nodo.carril = carril
      const def = el.eventDefinitions?.[0]?.$type
      if (def && DEFINICION_SEMANTICA[def]) nodo.evento = DEFINICION_SEMANTICA[def]
      if (el.$type === 'bpmn:BoundaryEvent') {
        nodo.adjunto_a = el.attachedToRef?.id
        if (el.cancelActivity === false) nodo.interrumpe = false
      }
      if (el.$type === 'bpmn:SubProcess') nodo.nodos = nodosDe(el, el.id)
      lista.push(nodo)
    }
    for (const a of contenedor.artifacts ?? []) {
      salida.otros.push({ id: a.id, tipo_bpmn: a.$type, ...(a.text ? { nombre: String(a.text) } : nombre(a)), ...(dentroDe ? { dentro_de: dentroDe } : {}) })
    }
    return lista
  }

  const carrilesDe = (process: Bo) => {
    const carriles: { id: string; nombre: string }[] = []
    const recorrer = (laneSet: Bo) => {
      for (const lane of laneSet?.lanes ?? []) {
        carriles.push({ id: lane.id, nombre: String(lane.name ?? '') })
        for (const ref of lane.flowNodeRef ?? []) carrilDe.set(ref.id, lane.id)
        recorrer(lane.childLaneSet)
      }
    }
    for (const ls of process?.laneSets ?? []) recorrer(ls)
    return carriles
  }

  const roots: Bo[] = defs?.rootElements ?? []
  const collaboration = roots.find((r) => r.$type === 'bpmn:Collaboration')
  const procesosConPool = new Set<string>()

  for (const p of collaboration?.participants ?? []) {
    const process = p.processRef
    if (process) procesosConPool.add(process.id)
    const carriles = carrilesDe(process)
    salida.pools.push({
      id: p.id,
      nombre: String(p.name ?? ''),
      carriles,
      nodos: process ? nodosDe(process) : [],
    })
  }
  for (const r of roots) {
    if (r.$type !== 'bpmn:Process' || procesosConPool.has(r.id)) continue
    const carriles = carrilesDe(r)
    salida.pools.push({ id: r.id, nombre: String(r.name ?? 'Proceso'), sin_pool: true, carriles, nodos: nodosDe(r) })
  }
  for (const m of collaboration?.messageFlows ?? []) {
    salida.mensajes.push({ id: m.id, desde: m.sourceRef?.id, hasta: m.targetRef?.id, ...nombre(m) })
  }
  for (const a of collaboration?.artifacts ?? []) {
    salida.otros.push({ id: a.id, tipo_bpmn: a.$type, ...(a.text ? { nombre: String(a.text) } : nombre(a)) })
  }
  return salida
}
