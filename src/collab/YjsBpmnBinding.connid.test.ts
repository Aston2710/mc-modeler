// @vitest-environment jsdom
/**
 * Fix de flechas duplicadas: el binding debe crear conexiones con
 * businessObject.id === element.id === clave del doc. Antes bpmn-js asignaba un
 * id automático al bo → divergía del id del doc → tras export/import el doc no
 * reconocía la flecha y creaba un duplicado.
 *
 * Usa bpmn-js REAL (no mock) porque el bug vive precisamente en cómo bpmn-js
 * asigna el id del businessObject cuando no se le pasa uno.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as Y from 'yjs'
// @ts-ignore
import Modeler from 'bpmn-js/lib/Modeler'
import { YjsBpmnBinding } from './YjsBpmnBinding'
import type { ElementSnapshot } from './yBpmnModel'
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

let modeler: Any
let container: HTMLElement

async function setup() {
  container = document.createElement('div')
  document.body.appendChild(container)
  modeler = new Modeler({ container, moddleExtensions: { flujo: flujoModdle } })
  await modeler.importXML(XML)
  const doc = new Y.Doc()
  const binding = new YjsBpmnBinding(modeler, doc)
  binding.start()
  return { doc, binding, registry: modeler.get('elementRegistry') as Any }
}

function remoteSet(doc: Y.Doc, entries: [string, ElementSnapshot][]) {
  Y.transact(doc, () => {
    const m = doc.getMap<ElementSnapshot>('elements')
    entries.forEach(([k, v]) => m.set(k, v))
  }, Symbol('remote-test'))
}

const connSnap = (id: string, wps: { x: number; y: number }[]): ElementSnapshot => ({
  id, type: 'bpmn:SequenceFlow', parent: 'P',
  source: 'Task_A', target: 'Task_B', waypoints: wps,
} as ElementSnapshot)

afterEach(() => { modeler?.destroy(); container?.remove() })

describe('fix flechas duplicadas (identidad de conexión)', () => {
  it('conexión creada por el binding: businessObject.id === element.id === clave del doc', async () => {
    const { doc, binding, registry } = await setup()
    remoteSet(doc, [['Flow_remote', connSnap('Flow_remote', [{ x: 200, y: 140 }, { x: 400, y: 140 }])]])

    const conn = registry.get('Flow_remote')
    expect(conn).toBeTruthy()
    // el fix: el id del businessObject NO diverge (antes era auto "SequenceFlow_x")
    expect(conn.businessObject.id).toBe('Flow_remote')
    expect(conn.id).toBe('Flow_remote')
    binding.destroy()
  })

  it('no re-crea la misma conexión (idempotente por id) en un segundo reconcile', async () => {
    const { doc, binding, registry } = await setup()
    remoteSet(doc, [['Flow_remote', connSnap('Flow_remote', [{ x: 200, y: 140 }, { x: 400, y: 140 }])]])
    binding.resync() // segundo pase: no debe duplicar
    const conns = registry.filter((el: Any) => Array.isArray(el.waypoints) && el.source && el.target)
    expect(conns.length).toBe(1)
    binding.destroy()
  })

  it('dedup no destructivo: snapshot con OTRO id pero misma flecha (waypoints idénticos) no duplica', async () => {
    const { doc, binding, registry } = await setup()
    remoteSet(doc, [['Flow_remote', connSnap('Flow_remote', [{ x: 200, y: 140 }, { x: 400, y: 140 }])]])
    // simula dato corrupto: el doc trae la MISMA flecha con id divergente
    remoteSet(doc, [['SequenceFlow_auto', connSnap('SequenceFlow_auto', [{ x: 200, y: 140 }, { x: 400, y: 140 }])]])

    expect(registry.get('SequenceFlow_auto')).toBeFalsy() // no se creó el duplicado
    const conns = registry.filter((el: Any) => Array.isArray(el.waypoints) && el.source && el.target)
    expect(conns.length).toBe(1) // sigue habiendo UNA sola flecha
    binding.destroy()
  })

  it('paralela legítima (waypoints distintos) SÍ se crea', async () => {
    const { doc, binding, registry } = await setup()
    remoteSet(doc, [['Flow_1', connSnap('Flow_1', [{ x: 200, y: 135 }, { x: 400, y: 135 }])]])
    remoteSet(doc, [['Flow_2', connSnap('Flow_2', [{ x: 200, y: 150 }, { x: 400, y: 150 }])]])
    const conns = registry.filter((el: Any) => Array.isArray(el.waypoints) && el.source && el.target)
    expect(conns.length).toBe(2) // dos paralelas reales, no se deduplican
    binding.destroy()
  })
})
