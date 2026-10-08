import { ELEMENT_SIZES } from '../../bpmn/ElementSizes'
import { forceCanonicalBpmnPrefix } from '../../utils/normalizeBpmnXml'
import { crearModdle } from './construirXml'
import {
  DEFINICION_BPMN,
  LIMITES,
  PATRON_ID,
  TIPO_BPMN,
  TIPO_SEMANTICO,
  esActividad,
  esCompuerta,
  esEvento,
  type DefinicionEvento,
  type TipoNodo,
} from './modelo'
import { trazarConexiones, type ConexionExistente, type FormaParaTrazar } from './trazado'

/**
 * Operaciones de alto nivel sobre un diagrama YA guardado.
 *
 * Principio: tocar lo mínimo. Se parte del XML tal cual está en la base, se
 * aplican las operaciones sobre el árbol de moddle y se serializa. Lo que no se
 * nombra en una operación —ids, coordenadas, flechas manuales, extensiones
 * `flujo:` o `bizagi:`— sale igual que entró. Si el XML de partida tiene algo
 * que moddle no entiende (avisos al leer), NO se modifica: re-serializarlo
 * podría perder justo esa parte.
 *
 * Todas las operaciones de una llamada se aplican o ninguna: si una falla, se
 * lanza antes de serializar y no se escribe nada.
 */

export type Operacion =
  | {
      op: 'agregar_nodo'
      id: string
      tipo: TipoNodo
      nombre?: string
      evento?: DefinicionEvento
      adjunto_a?: string
      interrumpe?: boolean
      /** Pool (participante) donde va. Obligatorio si hay más de uno, salvo con `despues_de` o `dentro_de`. */
      pool?: string
      /** Carril. Obligatorio si el pool tiene carriles, salvo con `despues_de`. */
      carril?: string
      /** Subproceso expandido dentro del cual va. */
      dentro_de?: string
      /** Nodo existente a cuya derecha se coloca. */
      despues_de?: string
    }
  | { op: 'renombrar'; id: string; nombre: string }
  | { op: 'conectar'; desde: string; hasta: string; nombre?: string; id?: string }
  | { op: 'eliminar'; id: string }

export class ErrorEdicion extends Error {
  constructor(message: string, public readonly operacion?: number) {
    super(operacion === undefined ? message : `operación ${operacion + 1}: ${message}`)
    this.name = 'ErrorEdicion'
  }
}

export interface ResultadoEdicion {
  xml: string
  elementos: number
  cambios: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bo = any
interface Caja { x: number; y: number; width: number; height: number }

const MAX_OPERACIONES = 50
const HUECO = 50

const solapan = (a: Caja, b: Caja) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

function tamanoDe(tipo: TipoNodo) {
  if (esEvento(tipo)) return { ...ELEMENT_SIZES.event }
  if (esCompuerta(tipo)) return { ...ELEMENT_SIZES.gateway }
  if (tipo === 'subproceso') return { ...ELEMENT_SIZES.subProcessCollapsed }
  return { ...ELEMENT_SIZES.task }
}

/** Índice del árbol: elementos, contenedores, carriles y DI. */
class Indice {
  elementos = new Map<string, Bo>()
  contenedor = new Map<string, Bo>() // id de flow element → process/subprocess
  procesoDePool = new Map<string, Bo>()
  poolDeProceso = new Map<string, Bo>()
  carrilDe = new Map<string, Bo>()
  di = new Map<string, Bo>()
  plano: Bo
  collaboration: Bo

  constructor(public defs: Bo) {
    for (const d of defs.diagrams ?? []) {
      for (const el of d.plane?.planeElement ?? []) if (el.bpmnElement) this.di.set(el.bpmnElement.id, el)
    }
    this.plano = defs.diagrams?.[0]?.plane
    this.collaboration = (defs.rootElements ?? []).find((r: Bo) => r.$type === 'bpmn:Collaboration')
    for (const p of this.collaboration?.participants ?? []) {
      this.elementos.set(p.id, p)
      if (p.processRef) {
        this.procesoDePool.set(p.id, p.processRef)
        this.poolDeProceso.set(p.processRef.id, p)
      }
    }
    for (const m of this.collaboration?.messageFlows ?? []) this.elementos.set(m.id, m)
    for (const r of defs.rootElements ?? []) {
      this.elementos.set(r.id, r)
      if (r.$type === 'bpmn:Process') this.recorrer(r)
    }
  }

  private recorrer(contenedor: Bo) {
    for (const el of contenedor.flowElements ?? []) {
      this.elementos.set(el.id, el)
      this.contenedor.set(el.id, contenedor)
      if (el.flowElements) this.recorrer(el)
    }
    for (const a of contenedor.artifacts ?? []) this.elementos.set(a.id, a)
    const lanes = (ls: Bo) => {
      for (const lane of ls?.lanes ?? []) {
        this.elementos.set(lane.id, lane)
        for (const ref of lane.flowNodeRef ?? []) this.carrilDe.set(ref.id, lane)
        lanes(lane.childLaneSet)
      }
    }
    for (const ls of contenedor.laneSets ?? []) lanes(ls)
  }

  /** Proceso raíz (el del pool) de un elemento, subiendo por subprocesos. */
  procesoRaiz(id: string): Bo {
    let c = this.contenedor.get(id)
    while (c && c.$type !== 'bpmn:Process') c = this.contenedor.get(c.id)
    return c
  }

  poolDe(id: string): Bo {
    if (this.procesoDePool.has(id)) return this.elementos.get(id)
    const p = this.procesoRaiz(id)
    return p ? this.poolDeProceso.get(p.id) : undefined
  }

  idUsado(id: string): boolean {
    if (this.elementos.has(id)) return true
    for (const d of this.di.values()) if (d.id === id) return true
    return false
  }

  bounds(id: string): Caja | undefined {
    const b = this.di.get(id)?.bounds
    return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : undefined
  }
}

export async function editarXml(xml: string, operaciones: Operacion[]): Promise<ResultadoEdicion> {
  if (!Array.isArray(operaciones) || operaciones.length === 0) throw new ErrorEdicion('no hay operaciones')
  if (operaciones.length > MAX_OPERACIONES) throw new ErrorEdicion(`como máximo ${MAX_OPERACIONES} operaciones por llamada`)

  const moddle = crearModdle()
  const { rootElement: defs, warnings } = await moddle.fromXML(xml)
  if (warnings.length) {
    throw new ErrorEdicion(
      `el diagrama tiene partes que el conector no entiende (${warnings.length} avisos al leerlo); ` +
      'modificarlo podría perderlas, así que no se toca. Ábrelo en la app o crea una copia.'
    )
  }
  forceCanonicalBpmnPrefix(defs)
  const ix = new Indice(defs)
  if (!ix.plano) throw new ErrorEdicion('el diagrama no tiene información gráfica (DI)')
  const cambios: string[] = []

  operaciones.forEach((op, i) => {
    try {
      switch (op.op) {
        case 'agregar_nodo': cambios.push(agregarNodo(moddle, ix, op)); break
        case 'renombrar': cambios.push(renombrar(ix, op)); break
        case 'conectar': cambios.push(conectar(moddle, ix, op)); break
        case 'eliminar': cambios.push(eliminar(ix, op)); break
        default: throw new ErrorEdicion(`operación desconocida "${(op as { op?: string })?.op}"`)
      }
    } catch (e) {
      if (e instanceof ErrorEdicion && e.operacion === undefined) throw new ErrorEdicion(e.message, i)
      throw e
    }
  })

  const { xml: salida } = await moddle.toXML(defs, { format: true })
  if (new TextEncoder().encode(salida).length > LIMITES.MAX_BYTES_XML) {
    throw new ErrorEdicion(`el XML resultante supera ${LIMITES.MAX_BYTES_XML} bytes`)
  }
  const relectura = await crearModdle().fromXML(salida)
  if (relectura.warnings.length) {
    throw new ErrorEdicion(`el resultado no se relee limpio: ${relectura.warnings.map((w: Bo) => w.message).join('; ')}`)
  }
  const elementos = contarElementos(relectura.rootElement)
  if (elementos > LIMITES.MAX_NODOS) throw new ErrorEdicion(`el diagrama quedaría con ${elementos} elementos; el máximo es ${LIMITES.MAX_NODOS}`)
  return { xml: salida, elementos, cambios }
}

/** Pools, carriles, nodos y flujos: el mismo criterio que `construirXml`. */
export function contarElementos(defs: Bo): number {
  let n = 0
  const recorrer = (c: Bo) => {
    for (const el of c.flowElements ?? []) { n++; if (el.flowElements) recorrer(el) }
    const lanes = (ls: Bo) => { for (const l of ls?.lanes ?? []) { n++; lanes(l.childLaneSet) } }
    for (const ls of c.laneSets ?? []) lanes(ls)
  }
  for (const r of defs?.rootElements ?? []) {
    if (r.$type === 'bpmn:Process') recorrer(r)
    if (r.$type === 'bpmn:Collaboration') n += (r.participants?.length ?? 0) + (r.messageFlows?.length ?? 0)
  }
  return n
}

// ── agregar_nodo ────────────────────────────────────────────────────────────

function agregarNodo(moddle: Bo, ix: Indice, op: Extract<Operacion, { op: 'agregar_nodo' }>): string {
  if (typeof op.id !== 'string' || !PATRON_ID.test(op.id)) throw new ErrorEdicion(`id "${op.id}" no válido`)
  if (ix.idUsado(op.id)) throw new ErrorEdicion(`el id "${op.id}" ya existe en el diagrama`)
  if (!(op.tipo in TIPO_BPMN)) throw new ErrorEdicion(`tipo "${op.tipo}" desconocido`)
  if (op.nombre !== undefined && String(op.nombre).length > LIMITES.MAX_LARGO_NOMBRE) {
    throw new ErrorEdicion(`el nombre supera ${LIMITES.MAX_LARGO_NOMBRE} caracteres`)
  }
  if (op.evento !== undefined && (!esEvento(op.tipo) || !(op.evento in DEFINICION_BPMN))) {
    throw new ErrorEdicion('"evento" solo vale para eventos y debe ser una definición conocida')
  }

  const ref = op.despues_de ? ix.elementos.get(op.despues_de) : undefined
  if (op.despues_de && (!ref || !ix.contenedor.has(op.despues_de))) {
    throw new ErrorEdicion(`"despues_de": "${op.despues_de}" no es un nodo del diagrama`)
  }

  // ── Contenedor (proceso o subproceso) ──
  let contenedor: Bo
  if (op.dentro_de) {
    contenedor = ix.elementos.get(op.dentro_de)
    if (contenedor?.$type !== 'bpmn:SubProcess') throw new ErrorEdicion(`"dentro_de": "${op.dentro_de}" no es un subproceso`)
    if (!ix.di.get(op.dentro_de)?.isExpanded) throw new ErrorEdicion(`el subproceso "${op.dentro_de}" no está expandido en el diagrama`)
  } else if (op.tipo === 'evento_borde' && op.adjunto_a) {
    contenedor = ix.contenedor.get(op.adjunto_a)
  } else if (ref) {
    contenedor = ix.contenedor.get(op.despues_de!)
  } else if (op.pool) {
    contenedor = ix.procesoDePool.get(op.pool)
    if (!contenedor) throw new ErrorEdicion(`"pool": "${op.pool}" no existe o no tiene proceso`)
  } else {
    const procesos = (ix.defs.rootElements ?? []).filter((r: Bo) => r.$type === 'bpmn:Process')
    if (procesos.length !== 1) throw new ErrorEdicion('el diagrama tiene varios pools: indica "pool", "despues_de" o "dentro_de"')
    contenedor = procesos[0]
  }
  if (!contenedor) throw new ErrorEdicion('no se pudo determinar dónde va el nodo')

  // ── Carril ──
  let lane: Bo
  if (contenedor.$type === 'bpmn:Process' && contenedor.laneSets?.length) {
    if (op.carril) {
      lane = ix.elementos.get(op.carril)
      if (lane?.$type !== 'bpmn:Lane' || !contenedor.laneSets.some((ls: Bo) => contieneLane(ls, lane))) {
        throw new ErrorEdicion(`"carril": "${op.carril}" no es un carril de ese pool`)
      }
    } else if (ref) {
      lane = ix.carrilDe.get(ref.id)
    } else if (op.tipo === 'evento_borde' && op.adjunto_a) {
      lane = ix.carrilDe.get(op.adjunto_a)
    }
    if (!lane) throw new ErrorEdicion('el pool tiene carriles: indica "carril" o "despues_de"')
  }

  // ── Elemento ──
  const bo = moddle.create(TIPO_BPMN[op.tipo], { id: op.id })
  if (op.nombre) bo.name = op.nombre
  if (op.evento) bo.eventDefinitions = [moddle.create(DEFINICION_BPMN[op.evento], { id: libre(ix, `${op.id}_def`) })]
  if (op.tipo === 'evento_borde') {
    const host = op.adjunto_a ? ix.elementos.get(op.adjunto_a) : undefined
    const tipoHost = host ? TIPO_SEMANTICO[host.$type] : undefined
    if (!host || !tipoHost || !esActividad(tipoHost)) throw new ErrorEdicion('"adjunto_a" debe ser una tarea o subproceso existente')
    bo.attachedToRef = host
    if (op.interrumpe === false) bo.cancelActivity = false
  } else if (op.adjunto_a !== undefined) {
    throw new ErrorEdicion('solo un evento_borde lleva "adjunto_a"')
  }
  if (op.tipo === 'subproceso') bo.flowElements = []
  bo.$parent = contenedor
  contenedor.flowElements = contenedor.flowElements ?? []
  contenedor.flowElements.push(bo)
  if (lane) {
    lane.flowNodeRef = lane.flowNodeRef ?? []
    lane.flowNodeRef.push(bo)
    ix.carrilDe.set(bo.id, lane)
  }
  ix.elementos.set(bo.id, bo)
  ix.contenedor.set(bo.id, contenedor)

  // ── Posición ──
  const t = tamanoDe(op.tipo)
  let caja: Caja
  if (op.tipo === 'evento_borde') {
    const h = ix.bounds(op.adjunto_a!)!
    const yaMontados = [...ix.elementos.values()].filter((e) => e !== bo && e.attachedToRef?.id === op.adjunto_a).length
    const cx = Math.max(h.x + t.width / 2, h.x + h.width - t.width / 2 - 2 - yaMontados * 44)
    caja = { x: Math.round(cx - t.width / 2), y: Math.round(h.y + h.height - t.height / 2), ...t }
  } else {
    const area = areaDe(ix, contenedor, lane)
    const r = ref ? ix.bounds(ref.id) : undefined
    let x: number
    let cy: number
    if (r) {
      x = r.x + r.width + HUECO
      cy = r.y + r.height / 2
    } else {
      const dentro = formasEn(ix, area)
      x = dentro.length ? Math.max(...dentro.map((c) => c.x + c.width)) + HUECO : area.x + (contenedor.$type === 'bpmn:Process' ? 70 : 20)
      cy = area.y + area.height / 2
    }
    caja = { x: Math.round(x), y: Math.round(cy - t.height / 2), ...t }
    // Bajar hasta un hueco libre: nunca encima de otra forma.
    const ocupadas = formasDeNodos(ix).filter((c) => c.id !== bo.id)
    for (let i = 0; i < 40 && ocupadas.some((c) => solapan(holgura(caja, 10), c)); i++) caja.y += t.height + 30
    asegurarEspacio(ix, contenedor, lane, caja)
  }

  ix.plano.planeElement.push(moddle.create('bpmndi:BPMNShape', {
    id: libre(ix, `${bo.id}_di`),
    bpmnElement: bo,
    bounds: moddle.create('dc:Bounds', caja),
    ...(op.tipo === 'subproceso' ? { isExpanded: false } : {}),
  }))
  ix.di.set(bo.id, ix.plano.planeElement[ix.plano.planeElement.length - 1])
  return `agregado ${op.tipo} "${op.id}"`
}

function contieneLane(ls: Bo, lane: Bo): boolean {
  return (ls?.lanes ?? []).some((l: Bo) => l === lane || contieneLane(l.childLaneSet, lane))
}

function holgura(c: Caja, h: number): Caja {
  return { x: c.x - h, y: c.y - h, width: c.width + 2 * h, height: c.height + 2 * h }
}

function libre(ix: Indice, base: string): string {
  let id = base
  for (let i = 2; ix.idUsado(id); i++) id = `${base}_${i}`
  return id
}

/** Caja disponible para colocar: el carril, el subproceso o el pool. */
function areaDe(ix: Indice, contenedor: Bo, lane: Bo): Caja {
  const desde = lane ? ix.bounds(lane.id)
    : contenedor.$type === 'bpmn:SubProcess' ? ix.bounds(contenedor.id)
    : ix.bounds(ix.poolDeProceso.get(contenedor.id)?.id ?? '')
  if (desde) return desde
  // Proceso suelto sin pool: el área de todo lo que ya hay.
  const todas = formasDeNodos(ix)
  if (!todas.length) return { x: 100, y: 50, width: 600, height: 250 }
  const x = Math.min(...todas.map((c) => c.x))
  const y = Math.min(...todas.map((c) => c.y))
  return { x, y, width: Math.max(...todas.map((c) => c.x + c.width)) - x, height: Math.max(...todas.map((c) => c.y + c.height)) - y }
}

const ES_CONTENEDOR = new Set(['bpmn:Participant', 'bpmn:Lane'])

function formasDeNodos(ix: Indice): (Caja & { id: string })[] {
  const salida: (Caja & { id: string })[] = []
  for (const [id, d] of ix.di) {
    if (d.$type !== 'bpmndi:BPMNShape' || !d.bounds) continue
    if (ES_CONTENEDOR.has(d.bpmnElement.$type)) continue
    if (d.bpmnElement.$type === 'bpmn:SubProcess' && d.isExpanded) continue
    salida.push({ id, x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height })
  }
  return salida
}

function formasEn(ix: Indice, area: Caja): Caja[] {
  return formasDeNodos(ix).filter((c) => c.x >= area.x && c.y >= area.y && c.x + c.width <= area.x + area.width && c.y + c.height <= area.y + area.height)
}

/**
 * Si la caja nueva no cabe en su carril/subproceso/pool, se agranda el
 * contenedor y se desplaza lo que está debajo (o a la derecha), como haría la
 * app al estirar un carril. Solo se mueve lo que queda al otro lado del corte.
 */
function asegurarEspacio(ix: Indice, contenedor: Bo, lane: Bo, caja: Caja) {
  const margen = 20
  const area = areaDe(ix, contenedor, lane)
  const poolBo = contenedor.$type === 'bpmn:Process' ? ix.poolDeProceso.get(contenedor.id) : ix.poolDe(contenedor.id)

  const sobranteAbajo = caja.y + caja.height + margen - (area.y + area.height)
  if (sobranteAbajo > 0) desplazar(ix, 'y', area.y + area.height, sobranteAbajo, caja)

  // El pool se lee DESPUÉS de crecer hacia abajo: con la franja de antes, lo
  // que acaba de estirarse quedaría fuera y no se ensancharía.
  const pool = poolBo ? ix.bounds(poolBo.id) : undefined
  const areaTrasBajar = areaDe(ix, contenedor, lane)
  const sobranteDerecha = caja.x + caja.width + margen - (areaTrasBajar.x + areaTrasBajar.width)
  if (sobranteDerecha > 0) {
    const limite = pool ? { y0: pool.y, y1: pool.y + pool.height } : undefined
    desplazar(ix, 'x', areaTrasBajar.x + areaTrasBajar.width, sobranteDerecha, caja, limite)
  }
}

/**
 * Corte en `eje = corte`: lo que empieza al otro lado se desplaza `delta`, y
 * los contenedores que atraviesan el corte crecen `delta`. Con `limite`, solo
 * se toca lo que está en esa franja vertical (el pool afectado).
 */
function desplazar(ix: Indice, eje: 'x' | 'y', corte: number, delta: number, nueva: Caja, limite?: { y0: number; y1: number }) {
  const lado = eje === 'x' ? 'width' : 'height'
  const enFranja = (b: Caja) => !limite || (b.y >= limite.y0 - 1 && b.y + b.height <= limite.y1 + 1)
  for (const d of ix.di.values()) {
    if (d.$type === 'bpmndi:BPMNShape' && d.bounds) {
      const b = d.bounds
      if (!enFranja(b)) continue
      const esContenedor = ES_CONTENEDOR.has(d.bpmnElement.$type) || (d.bpmnElement.$type === 'bpmn:SubProcess' && d.isExpanded)
      if (b[eje] >= corte) b[eje] += delta
      else if (esContenedor && b[eje] + b[lado] >= corte - 1 && cruzaOtroEje(b, nueva, eje)) b[lado] += delta
    } else if (d.$type === 'bpmndi:BPMNEdge') {
      for (const p of d.waypoint ?? []) if (p[eje] >= corte && (!limite || (p.y >= limite.y0 && p.y <= limite.y1))) p[eje] += delta
    }
  }
  // Las etiquetas externas viajan con su forma.
  for (const d of ix.di.values()) {
    const lb = d.label?.bounds
    if (lb && lb[eje] >= corte && (!limite || (lb.y >= limite.y0 && lb.y <= limite.y1))) lb[eje] += delta
  }
}

/** ¿El contenedor `b` abarca a `nueva` en el eje contrario al del corte? */
function cruzaOtroEje(b: Caja, nueva: Caja, eje: 'x' | 'y'): boolean {
  return eje === 'y'
    ? b.x <= nueva.x && b.x + b.width >= nueva.x
    : b.y <= nueva.y && b.y + b.height >= nueva.y + nueva.height
}

// ── renombrar ───────────────────────────────────────────────────────────────

function renombrar(ix: Indice, op: Extract<Operacion, { op: 'renombrar' }>): string {
  const el = ix.elementos.get(op.id)
  if (!el || el.$type === 'bpmn:Process' || el.$type === 'bpmn:Collaboration') throw new ErrorEdicion(`"${op.id}" no existe o no tiene nombre`)
  if (typeof op.nombre !== 'string') throw new ErrorEdicion('"nombre" debe ser texto')
  if (op.nombre.length > LIMITES.MAX_LARGO_NOMBRE) throw new ErrorEdicion(`el nombre supera ${LIMITES.MAX_LARGO_NOMBRE} caracteres`)
  if (el.$type === 'bpmn:TextAnnotation') el.text = op.nombre
  else if (op.nombre) el.name = op.nombre
  else delete el.name
  return `renombrado "${op.id}"`
}

// ── conectar ────────────────────────────────────────────────────────────────

function esNodoDeFlujo(bo: Bo): boolean {
  return !!bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:FlowNode')
}

function conectar(moddle: Bo, ix: Indice, op: Extract<Operacion, { op: 'conectar' }>): string {
  const a = ix.elementos.get(op.desde)
  const b = ix.elementos.get(op.hasta)
  if (!a || !b) throw new ErrorEdicion(`"${!a ? op.desde : op.hasta}" no existe en el diagrama`)
  if (op.id !== undefined && (!PATRON_ID.test(op.id) || ix.idUsado(op.id))) throw new ErrorEdicion(`id "${op.id}" no válido o ya usado`)
  if (op.nombre !== undefined && String(op.nombre).length > LIMITES.MAX_LARGO_NOMBRE) {
    throw new ErrorEdicion(`el nombre supera ${LIMITES.MAX_LARGO_NOMBRE} caracteres`)
  }
  if (!ix.di.get(a.id) || !ix.di.get(b.id)) throw new ErrorEdicion('los dos extremos deben estar dibujados en el diagrama')

  const mismoNivel = esNodoDeFlujo(a) && esNodoDeFlujo(b) && ix.contenedor.get(a.id) === ix.contenedor.get(b.id)
  const poolA = ix.poolDe(a.id)
  const poolB = ix.poolDe(b.id)
  let flow: Bo
  if (mismoNivel) {
    const yaExiste = (a.outgoing ?? []).some((f: Bo) => f.targetRef === b)
    if (yaExiste) throw new ErrorEdicion(`ya existe un flujo de "${a.id}" a "${b.id}"`)
    flow = moddle.create('bpmn:SequenceFlow', { id: op.id ?? libre(ix, 'Flow_mcp'), sourceRef: a, targetRef: b })
    const contenedor = ix.contenedor.get(a.id)
    flow.$parent = contenedor
    contenedor.flowElements.push(flow)
    a.outgoing = a.outgoing ?? []
    a.outgoing.push(flow)
    b.incoming = b.incoming ?? []
    b.incoming.push(flow)
    ix.contenedor.set(flow.id, contenedor)
  } else if (poolA && poolB && poolA !== poolB && ix.collaboration) {
    const yaExiste = (ix.collaboration.messageFlows ?? []).some((m: Bo) => m.sourceRef === a && m.targetRef === b)
    if (yaExiste) throw new ErrorEdicion(`ya existe un mensaje de "${a.id}" a "${b.id}"`)
    flow = moddle.create('bpmn:MessageFlow', { id: op.id ?? libre(ix, 'MessageFlow_mcp'), sourceRef: a, targetRef: b })
    flow.$parent = ix.collaboration
    ix.collaboration.messageFlows = ix.collaboration.messageFlows ?? []
    ix.collaboration.messageFlows.push(flow)
  } else {
    throw new ErrorEdicion(
      `"${a.id}" y "${b.id}" no se pueden unir: un flujo va dentro del mismo pool y nivel, un mensaje entre pools distintos`
    )
  }
  if (op.nombre) flow.name = op.nombre
  ix.elementos.set(flow.id, flow)

  const wps = trazarUna(ix, flow, a.id, b.id)
  const edge = moddle.create('bpmndi:BPMNEdge', {
    id: libre(ix, `${flow.id}_di`),
    bpmnElement: flow,
    waypoint: wps.map((p) => moddle.create('dc:Point', p)),
  })
  ix.plano.planeElement.push(edge)
  ix.di.set(flow.id, edge)
  return `conectado "${a.id}" → "${b.id}" (${flow.$type === 'bpmn:MessageFlow' ? 'mensaje' : 'flujo'} "${flow.id}")`
}

function trazarUna(ix: Indice, flow: Bo, desde: string, hasta: string) {
  const formas: FormaParaTrazar[] = []
  const existentes: ConexionExistente[] = []
  for (const [id, d] of ix.di) {
    if (d.$type === 'bpmndi:BPMNShape' && d.bounds) {
      formas.push({ id, x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, businessObject: d.bpmnElement, incoming: [], outgoing: [] })
    }
  }
  const porId = new Map(formas.map((f) => [f.id, f]))
  for (const f of formas) {
    const host = f.businessObject.attachedToRef?.id
    if (host) f.host = porId.get(host)
  }
  for (const [, d] of ix.di) {
    const bo = d.bpmnElement
    if (d.$type !== 'bpmndi:BPMNEdge' || !bo?.sourceRef || !bo?.targetRef) continue
    existentes.push({ bo, desde: bo.sourceRef.id, hasta: bo.targetRef.id, waypoints: (d.waypoint ?? []).map((p: Bo) => ({ x: p.x, y: p.y })) })
  }
  return trazarConexiones(formas, [{ bo: flow, desde, hasta }], existentes).get(flow.id)!
}

// ── eliminar ────────────────────────────────────────────────────────────────

function eliminar(ix: Indice, op: Extract<Operacion, { op: 'eliminar' }>): string {
  const el = ix.elementos.get(op.id)
  if (!el) throw new ErrorEdicion(`"${op.id}" no existe en el diagrama`)
  const esFlujo = el.$type === 'bpmn:SequenceFlow' || el.$type === 'bpmn:MessageFlow'
  if (!esFlujo && !esNodoDeFlujo(el)) {
    throw new ErrorEdicion(`"${op.id}" es un ${el.$type}: el conector solo elimina nodos y flujos, no pools ni carriles`)
  }

  // Qué cae: el nodo, su contenido si es subproceso, sus eventos de borde, y
  // todo flujo o asociación que toque algo de eso.
  const caen = new Set<string>([el.id])
  const anidados = (c: Bo) => { for (const h of c.flowElements ?? []) { caen.add(h.id); anidados(h) } }
  if (!esFlujo) anidados(el)
  for (const e of ix.elementos.values()) if (e.attachedToRef && caen.has(e.attachedToRef.id)) caen.add(e.id)
  for (const e of ix.elementos.values()) {
    if ((e.sourceRef && caen.has(e.sourceRef.id)) || (e.targetRef && caen.has(e.targetRef.id))) caen.add(e.id)
  }

  const quitar = <T>(lista: T[] | undefined, pred: (x: T) => boolean) => {
    if (!lista) return
    for (let i = lista.length - 1; i >= 0; i--) if (pred(lista[i])) lista.splice(i, 1)
  }
  for (const id of caen) {
    const e = ix.elementos.get(id)
    if (!e) continue
    const c = ix.contenedor.get(id)
    quitar(c?.flowElements, (x: Bo) => x.id === id)
    quitar(c?.artifacts, (x: Bo) => x.id === id)
    quitar(ix.collaboration?.messageFlows, (x: Bo) => x.id === id)
    const carril = ix.carrilDe.get(id)
    if (carril) quitar(carril.flowNodeRef, (x: Bo) => x.id === id)
    // Referencias colgantes en lo que queda.
    for (const otro of ix.elementos.values()) {
      if (caen.has(otro.id)) continue
      quitar(otro.incoming, (x: Bo) => x.id === id)
      quitar(otro.outgoing, (x: Bo) => x.id === id)
      if (otro.default?.id === id) delete otro.default
    }
  }
  for (const c of ix.contenedor.values()) quitar(c.artifacts, (a: Bo) => caen.has(a.sourceRef?.id) || caen.has(a.targetRef?.id))
  for (const d of ix.defs.diagrams ?? []) quitar(d.plane?.planeElement, (pe: Bo) => caen.has(pe.bpmnElement?.id))
  for (const id of caen) { ix.elementos.delete(id); ix.di.delete(id); ix.contenedor.delete(id); ix.carrilDe.delete(id) }
  return `eliminado "${op.id}"${caen.size > 1 ? ` y ${caen.size - 1} elemento(s) dependiente(s)` : ''}`
}
