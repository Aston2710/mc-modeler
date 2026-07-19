// @vitest-environment jsdom
/**
 * Idempotencia multi-doc del fix de flechas duplicadas (gate FASE 0 automatizado).
 *
 * Reproduce el escenario real de colaboración que originaba los duplicados:
 * el peer A crea una flecha → su binding la escribe en el Y.Doc de A → el update
 * se difunde (broadcast) y se aplica en el Y.Doc de B → el binding de B debe
 * materializar UNA sola flecha en su canvas (no una copia por el handshake).
 *
 * Antes del fix (`bo.id` divergente), el reconcile de B no reconocía la flecha
 * como "ya existente" y dibujaba una segunda. Este test lo blinda con dos
 * modeladores + dos docs reales conectados por un canal de broadcast simulado.
 *
 * Complementa a YjsBpmnBinding.connid.test.ts (un solo doc, remoto→canvas):
 * aquí es local(A)→doc(A)→broadcast→doc(B)→canvas(B), el camino de producción.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as Y from 'yjs'
// @ts-ignore
import Modeler from 'bpmn-js/lib/Modeler'
import { YjsBpmnBinding } from './YjsBpmnBinding'
import flujoModdle from '../bpmn/moddle/flujo.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

beforeEach(() => {
  const g = globalThis as Any
  if (!g.CSS) g.CSS = {}
  if (!g.CSS.escape) g.CSS.escape = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
  const proto = SVGElement.prototype as Any
  if (!proto.getBBox) proto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })
  const makeMatrix = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this }, multiply() { return this }, translate() { return this }, scale() { return this } })
  if (!g.SVGMatrix) g.SVGMatrix = class SVGMatrix {}
  class FTL {
    items: Any[] = []
    clear() { this.items = [] }
    appendItem(t: Any) { this.items.push(t); return t }
    consolidate() { if (!this.items.length) return null; const it = this.items[0]; return it.matrix ? it : { matrix: it } }
    createSVGTransformFromMatrix(m: Any) { return { matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} } }
  }
  if (!Object.getOwnPropertyDescriptor(proto, 'transform')) {
    Object.defineProperty(proto, 'transform', { get() { if (!this.__tl) this.__tl = { baseVal: new FTL() }; return this.__tl }, configurable: true })
  }
  const sp = (globalThis as Any).SVGSVGElement?.prototype
  if (sp) {
    if (!sp.createSVGMatrix) sp.createSVGMatrix = makeMatrix
    if (!sp.createSVGTransformFromMatrix) sp.createSVGTransformFromMatrix = (m: Any) => ({ matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    if (!sp.createSVGTransform) sp.createSVGTransform = () => ({ matrix: makeMatrix(), setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    if (!sp.createSVGPoint) sp.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) })
  }
})

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:task id="Task_A" />
    <bpmn:task id="Task_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dg">
    <bpmndi:BPMNPlane id="Pl" bpmnElement="P">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A"><dc:Bounds x="100" y="100" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B"><dc:Bounds x="400" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

interface Peer { modeler: Any; doc: Y.Doc; binding: YjsBpmnBinding; container: HTMLElement }
const peers: Peer[] = []

async function makePeer(): Promise<Peer> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const modeler = new Modeler({ container, moddleExtensions: { flujo: flujoModdle } })
  await modeler.importXML(XML)
  const doc = new Y.Doc()
  const binding = new YjsBpmnBinding(modeler, doc)
  binding.start()
  const peer: Peer = { modeler, doc, binding, container }
  peers.push(peer)
  return peer
}

// Canal de broadcast simulado: cada update local de un doc se aplica en el otro
// con un origin ajeno (como haría SupabaseProvider.sendYjsUpdate → applyUpdate).
// Un update sin cambios nuevos no dispara evento → no hay bucle infinito.
function wireBroadcast(a: Y.Doc, b: Y.Doc) {
  a.on('update', (u: Uint8Array, origin: Any) => { if (origin !== 'net') Y.applyUpdate(b, u, 'net') })
  b.on('update', (u: Uint8Array, origin: Any) => { if (origin !== 'net') Y.applyUpdate(a, u, 'net') })
}

const conns = (modeler: Any) =>
  (modeler.get('elementRegistry') as Any).filter((el: Any) => Array.isArray(el.waypoints) && el.source && el.target)

afterEach(() => {
  for (const p of peers) { try { p.binding.destroy() } catch { /* noop */ } ; try { p.modeler.destroy() } catch { /* noop */ } ; p.container.remove() }
  peers.length = 0
})

describe('idempotencia multi-doc (flechas duplicadas en colaboración)', () => {
  it('A crea una flecha → B materializa UNA sola (no duplica por broadcast)', async () => {
    const A = await makePeer()
    const B = await makePeer()
    wireBroadcast(A.doc, B.doc)

    // A conecta las dos tareas (crea SequenceFlow en el canvas de A).
    const reg = A.modeler.get('elementRegistry') as Any
    const modeling = A.modeler.get('modeling') as Any
    modeling.connect(reg.get('Task_A'), reg.get('Task_B'))
    A.binding.resync() // flush del sync local (en prod lo dispara el debounce/autosave) → broadcast

    const cA = conns(A.modeler)
    const cB = conns(B.modeler)
    expect(cA.length).toBe(1)          // A: una flecha
    expect(cB.length).toBe(1)          // B: exactamente una (el bug daba 2)
    expect(cB[0].id).toBe(cA[0].id)    // mismo id → identidad preservada cruzando el broadcast
    expect(cB[0].businessObject.id).toBe(cA[0].id)
  })

  it('re-broadcast del estado completo (late-join) no duplica en B', async () => {
    const A = await makePeer()
    const B = await makePeer()
    wireBroadcast(A.doc, B.doc)

    const reg = A.modeler.get('elementRegistry') as Any
    ;(A.modeler.get('modeling') as Any).connect(reg.get('Task_A'), reg.get('Task_B'))
    A.binding.resync()
    expect(conns(B.modeler).length).toBe(1)

    // Late-joiner / handshake: se reenvía TODO el estado de A a B otra vez.
    Y.applyUpdate(B.doc, Y.encodeStateAsUpdate(A.doc), 'net')
    B.binding.resync()

    expect(conns(B.modeler).length).toBe(1) // sigue habiendo UNA sola
  })

  it('doc B: una sola entrada de conexión en el mapa (sin clave divergente)', async () => {
    const A = await makePeer()
    const B = await makePeer()
    wireBroadcast(A.doc, B.doc)

    const reg = A.modeler.get('elementRegistry') as Any
    ;(A.modeler.get('modeling') as Any).connect(reg.get('Task_A'), reg.get('Task_B'))
    A.binding.resync()

    const mapB = B.doc.getMap('elements')
    let connEntries = 0
    mapB.forEach((snap: Any) => { if (snap && snap.source && snap.target && Array.isArray(snap.waypoints)) connEntries++ })
    expect(connEntries).toBe(1) // el doc de B no acumuló una segunda clave para la misma flecha
  })
})
