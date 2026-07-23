// @vitest-environment jsdom
/**
 * ¿Mover varios shapes seleccionados crea conexiones duplicadas?
 * bpmn-js real + binding + Y.Doc. Reproduce el escenario reportado.
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
  const mk = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this }, multiply() { return this }, translate() { return this }, scale() { return this } })
  if (!g.SVGMatrix) g.SVGMatrix = class SVGMatrix {}
  class FTL { items: Any[] = []; clear() { this.items = [] } appendItem(t: Any) { this.items.push(t); return t } consolidate() { if (!this.items.length) return null; const it = this.items[0]; return it.matrix ? it : { matrix: it } } createSVGTransformFromMatrix(m: Any) { return { matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} } } }
  if (!Object.getOwnPropertyDescriptor(proto, 'transform')) Object.defineProperty(proto, 'transform', { get() { if (!this.__tl) this.__tl = { baseVal: new FTL() }; return this.__tl }, configurable: true })
  const sp = (globalThis as Any).SVGSVGElement?.prototype
  if (sp) {
    if (!sp.createSVGMatrix) sp.createSVGMatrix = mk
    if (!sp.createSVGTransformFromMatrix) sp.createSVGTransformFromMatrix = (m: Any) => ({ matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    if (!sp.createSVGTransform) sp.createSVGTransform = () => ({ matrix: mk(), setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    if (!sp.createSVGPoint) sp.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) })
  }
})

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:task id="A" /><bpmn:task id="B" /><bpmn:task id="C" />
    <bpmn:sequenceFlow id="F_AB" sourceRef="A" targetRef="B" />
    <bpmn:sequenceFlow id="F_BC" sourceRef="B" targetRef="C" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dg"><bpmndi:BPMNPlane id="Pl" bpmnElement="P">
    <bpmndi:BPMNShape id="A_di" bpmnElement="A"><dc:Bounds x="100" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="B_di" bpmnElement="B"><dc:Bounds x="300" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="C_di" bpmnElement="C"><dc:Bounds x="500" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F_AB_di" bpmnElement="F_AB"><di:waypoint x="200" y="140" /><di:waypoint x="300" y="140" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F_BC_di" bpmnElement="F_BC"><di:waypoint x="400" y="140" /><di:waypoint x="500" y="140" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`

let modeler: Any, container: HTMLElement
async function setup() {
  container = document.createElement('div'); document.body.appendChild(container)
  modeler = new Modeler({ container, moddleExtensions: { flujo: flujoModdle } })
  await modeler.importXML(XML)
  const doc = new Y.Doc()
  const binding = new YjsBpmnBinding(modeler, doc)
  binding.start()
  return { doc, binding, reg: modeler.get('elementRegistry') as Any, modeling: modeler.get('modeling') as Any }
}
afterEach(() => { modeler?.destroy(); container?.remove() })

const conns = (reg: Any) => reg.filter((e: Any) => Array.isArray(e.waypoints) && e.source && e.target)

describe('mover varios shapes NO crea conexiones duplicadas', () => {
  it('mover A+B+C juntos (todas encerradas)', async () => {
    const { reg, modeling } = await setup()
    const before = conns(reg).length
    modeling.moveElements([reg.get('A'), reg.get('B'), reg.get('C')], { x: 120, y: 60 })
    expect(conns(reg).length).toBe(before)
    expect(reg.filter((e: Any) => e.id === 'F_AB').length).toBe(1)
  })

  it('mover A+B (F_BC queda con un extremo fuera de la selección)', async () => {
    const { reg, modeling } = await setup()
    const before = conns(reg).length
    modeling.moveElements([reg.get('A'), reg.get('B')], { x: 0, y: 150 })
    expect(conns(reg).length).toBe(before)
  })

  it('mover varias veces seguidas no acumula duplicados', async () => {
    const { reg, modeling } = await setup()
    const before = conns(reg).length
    for (let i = 0; i < 4; i++) modeling.moveElements([reg.get('A'), reg.get('B'), reg.get('C')], { x: 10, y: 10 })
    expect(conns(reg).length).toBe(before)
  })
})
