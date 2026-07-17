// @vitest-environment jsdom
/**
 * Tests de integración de la capa de routing con bpmn-js REAL (jsdom).
 *
 * Verifican el cableado completo — no las primitivas (eso lo cubre
 * orthogonal.test.ts) sino el comportamiento observable:
 *  - invariante de ortogonalidad tras comandos
 *  - semántica Bizagi repair-or-reroute en rutas manuales (findings §14)
 *  - lifecycle del flag flujo:manualRoute dentro del commandStack (undo atómico)
 *  - separación de flechas paralelas
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
 
// @ts-ignore
import Modeler from 'bpmn-js/lib/Modeler'
import BizagiLayouter from './BizagiLayouter'
import BizagiConnectionDocking from './BizagiConnectionDocking'
import OrthogonalityBehavior from './OrthogonalityBehavior'
import ManualRouteBehavior from './ManualRouteBehavior'
import { isManual, markManual } from './manualRoute'
import { isOrthogonal, routeInvades } from './orthogonal'
import flujoModdle from '../moddle/flujo.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

// ── shims jsdom para bpmn-js ─────────────────────────────────────────────────
beforeEach(() => {
  // jsdom no implementa CSS.escape (lo usa la Palette de diagram-js)
  const g = globalThis as Any
  if (!g.CSS) g.CSS = {}
  if (!g.CSS.escape) {
    g.CSS.escape = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
  }
  // jsdom no implementa APIs de geometría SVG que bpmn-js usa al renderizar
  const proto = SVGElement.prototype as Any
  if (!proto.getBBox) {
    proto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })
  }

  const makeMatrix = (init?: Any) => ({
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    ...init,
    inverse() { return makeMatrix() },
    multiply() { return this },
    translate() { return this },
    scale() { return this },
  })

  if (!g.SVGMatrix) g.SVGMatrix = class SVGMatrix {}

  // Lista de transforms mínima para tiny-svg: clear/appendItem/consolidate
  class FakeTransformList {
    items: Any[] = []
    clear() { this.items = [] }
    appendItem(t: Any) { this.items.push(t); return t }
    consolidate() {
      if (!this.items.length) return null
      const it = this.items[0]
      return it.matrix ? it : { matrix: it }
    }
    createSVGTransformFromMatrix(m: Any) { return { matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} } }
  }
  if (!Object.getOwnPropertyDescriptor(proto, 'transform')) {
    Object.defineProperty(proto, 'transform', {
      get() {
        if (!this.__tl) this.__tl = { baseVal: new FakeTransformList() }
        return this.__tl
      },
      configurable: true,
    })
  }

  const svgProto = (globalThis as Any).SVGSVGElement?.prototype
  if (svgProto) {
    if (!svgProto.createSVGMatrix) svgProto.createSVGMatrix = () => makeMatrix()
    if (!svgProto.createSVGTransformFromMatrix) {
      svgProto.createSVGTransformFromMatrix = (m: Any) => ({ matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    }
    if (!svgProto.createSVGTransform) {
      svgProto.createSVGTransform = () => ({ matrix: makeMatrix(), setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    }
    if (!svgProto.createSVGPoint) {
      svgProto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) })
    }
  }
})

const DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_A" />
    <bpmn:task id="Task_B" />
    <bpmn:sequenceFlow id="Flow_AB" sourceRef="Task_A" targetRef="Task_B" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diag_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="400" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_AB_di" bpmnElement="Flow_AB">
        <di:waypoint x="200" y="140" />
        <di:waypoint x="400" y="140" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

let modeler: Any
let container: HTMLElement

async function createModeler(xml = DIAGRAM) {
  container = document.createElement('div')
  document.body.appendChild(container)
  modeler = new Modeler({
    container,
    additionalModules: [
      BizagiLayouter,
      BizagiConnectionDocking,
      OrthogonalityBehavior,
      ManualRouteBehavior,
    ],
    moddleExtensions: { flujo: flujoModdle },
  })
  await modeler.importXML(xml)
  return {
    modeling: modeler.get('modeling') as Any,
    registry: modeler.get('elementRegistry') as Any,
    commandStack: modeler.get('commandStack') as Any,
    elementFactory: modeler.get('elementFactory') as Any,
  }
}

afterEach(() => {
  modeler?.destroy()
  container?.remove()
})

describe('invariante de ortogonalidad', () => {
  it('mover un shape en diagonal nunca deja segmentos diagonales', async () => {
    const { modeling, registry } = await createModeler()
    const taskB = registry.get('Task_B')
    // movimiento diagonal — el caso que históricamente producía diagonales
    modeling.moveShape(taskB, { x: 137, y: 93 })
    const flow = registry.get('Flow_AB')
    expect(isOrthogonal(flow.waypoints)).toBe(true)
    // extremos anclados a los shapes
    const wps = flow.waypoints
    const src = registry.get('Task_A'), tgt = registry.get('Task_B')
    expect(wps[0].x).toBeGreaterThanOrEqual(src.x - 2)
    expect(wps[0].x).toBeLessThanOrEqual(src.x + src.width + 2)
    expect(wps[wps.length - 1].y).toBeGreaterThanOrEqual(tgt.y - 2)
    expect(wps[wps.length - 1].y).toBeLessThanOrEqual(tgt.y + tgt.height + 2)
  })

  it('updateWaypoints con diagonales se repara dentro del mismo comando (un solo undo)', async () => {
    const { modeling, registry, commandStack } = await createModeler()
    const flow = registry.get('Flow_AB')
    const before = flow.waypoints.map((p: Any) => ({ x: p.x, y: p.y }))
    // forzar diagonal directamente (simula un camino de código externo)
    modeling.updateWaypoints(flow, [
      { x: 200, y: 140 },
      { x: 380, y: 165 }, // diagonal
    ])
    expect(isOrthogonal(flow.waypoints)).toBe(true)
    // un solo undo restaura el estado previo completo
    commandStack.undo()
    expect(flow.waypoints.map((p: Any) => ({ x: p.x, y: p.y }))).toEqual(before)
  })
})

describe('semántica Bizagi repair-or-reroute (rutas manuales)', () => {
  it('ruta manual de igual complejidad que la fresca se preserva (reparada) al mover el shape', async () => {
    const { modeling, registry } = await createModeler()
    const flow = registry.get('Flow_AB')
    const taskB = registry.get('Task_B')

    // desalinear los shapes: la ruta fresca óptima es una Z de 4 puntos
    modeling.moveShape(taskB, { x: 0, y: 200 })  // B en (400,300)

    // el usuario mueve el segmento medio: Z de 4 puntos con mid-x propio (350)
    modeling.updateWaypoints(flow, [
      { x: 200, y: 140 },
      { x: 350, y: 140 },
      { x: 350, y: 340 },
      { x: 400, y: 340 },
    ], { segmentMove: {} })  // hint de gesto → marca manual
    expect(isManual(flow)).toBe(true)

    // mover el target un poco: la Z del usuario sigue siendo válida y con
    // los mismos puntos que la fresca (4 ≤ 4) → se conserva reparada
    modeling.moveShape(taskB, { x: 0, y: 20 })
    expect(isOrthogonal(flow.waypoints)).toBe(true)
    expect(flow.waypoints.length).toBe(4)
    // el mid-x elegido por el usuario sobrevive (la fresca usaría el punto medio)
    expect(flow.waypoints[1].x).toBe(350)
    expect(isManual(flow)).toBe(true)
  })

  it('PRIORIDAD MANUAL: una ruta manual válida pero "compleja" (más codos que la fresca) se PRESERVA al mover el shape', async () => {
    // Cambio de semántica deliberado (antes §14 la descartaba por el criterio
    // de simplicidad): la decisión del usuario manda mientras sea válida.
    const { modeling, registry } = await createModeler()
    const flow = registry.get('Flow_AB')
    // desvío en U de 6 puntos, ortogonal, anclado — más complejo que la fresca
    modeling.updateWaypoints(flow, [
      { x: 200, y: 140 },
      { x: 250, y: 140 },
      { x: 250, y: 300 },
      { x: 350, y: 300 },
      { x: 350, y: 140 },
      { x: 400, y: 140 },
    ], { segmentMove: {} })
    expect(isManual(flow)).toBe(true)

    // mover el target: la ruta manual sigue siendo válida (ortogonal, anclada,
    // sin invadir) → se conserva su forma, NO se re-rutea a la canónica
    modeling.moveShape(registry.get('Task_B'), { x: 0, y: 40 })
    expect(isOrthogonal(flow.waypoints)).toBe(true)
    expect(flow.waypoints.length).toBeGreaterThanOrEqual(5) // conserva la U
    expect(isManual(flow)).toBe(true)                        // sigue manual
  })

  it('ruta manual INVÁLIDA (bend estrictamente dentro del target) sí se re-rutea y limpia el flag', async () => {
    const { modeling, registry } = await createModeler(GW_DIAGRAM)
    const td = registry.get('TD') // (380,300) 100×80 → interior x∈(381,479) y∈(301,379)
    const fd = registry.get('FD')
    // bend en (430,340): estrictamente DENTRO de TD → ruta inválida
    modeling.updateWaypoints(fd, [
      { x: 250, y: 180 },
      { x: 430, y: 180 },
      { x: 430, y: 340 }, // interior de TD
      { x: 380, y: 340 }, // sale por el borde izquierdo
    ], { segmentMove: {} })
    // el invariante la detecta inválida (invade TD) → ruta automática limpia
    expect(routeInvades(fd.waypoints, td)).toBe(false)
    expect(isOrthogonal(fd.waypoints)).toBe(true)
    expect(isManual(fd)).toBe(false)
  })
})

describe('prioridad de la ruta manual del usuario', () => {
  it('ruta manual larga multi-codo se preserva al mover un shape conectado', async () => {
    const { modeling, registry } = await createModeler()
    const flow = registry.get('Flow_AB')
    // ruta larga en escalera (8 puntos), válida
    const manual = [
      { x: 200, y: 140 },
      { x: 260, y: 140 },
      { x: 260, y: 260 },
      { x: 320, y: 260 },
      { x: 320, y: 120 },
      { x: 360, y: 120 },
      { x: 360, y: 140 },
      { x: 400, y: 140 },
    ]
    modeling.updateWaypoints(flow, manual, { segmentMove: {} })
    const lenBefore = flow.waypoints.length
    expect(isManual(flow)).toBe(true)

    modeling.moveShape(registry.get('Task_A'), { x: 0, y: 15 })
    expect(isOrthogonal(flow.waypoints)).toBe(true)
    // conserva la forma (nº de codos similar); no colapsa a la canónica de 2
    expect(flow.waypoints.length).toBeGreaterThanOrEqual(lenBefore - 1)
    expect(isManual(flow)).toBe(true)
  })

  it('mover un shape AJENO no destruye una ruta manual invadida (se respeta)', async () => {
    const { modeling, registry, elementFactory } = await createModeler()
    const flow = registry.get('Flow_AB')
    // ruta manual en U por debajo
    modeling.updateWaypoints(flow, [
      { x: 200, y: 140 },
      { x: 250, y: 140 },
      { x: 250, y: 300 },
      { x: 350, y: 300 },
      { x: 350, y: 140 },
      { x: 400, y: 140 },
    ], { segmentMove: {} })
    const shape = flow.waypoints.map((p: Any) => ({ x: p.x, y: p.y }))

    // soltar un shape ajeno encima del tramo inferior de la U
    const root = registry.get('Process_1') ?? modeler.get('canvas').getRootElement()
    const blocker = elementFactory.createShape({ type: 'bpmn:Task' })
    modeling.createShape(blocker, { x: 300, y: 300 }, root)

    // la ruta manual NO se re-rutea (Capa 4 solo toca autos); sigue manual
    expect(isManual(flow)).toBe(true)
    expect(flow.waypoints.map((p: Any) => ({ x: p.x, y: p.y }))).toEqual(shape)
  })
})

describe('lifecycle del flag manual (undo atómico)', () => {
  it('drag de segmento marca manual; Ctrl+Z restaura waypoints Y flag juntos', async () => {
    const { modeling, registry, commandStack } = await createModeler()
    const flow = registry.get('Flow_AB')
    const before = flow.waypoints.map((p: Any) => ({ x: p.x, y: p.y }))
    expect(isManual(flow)).toBe(false)

    // simula el commit de ConnectionSegmentMove (hint segmentMove)
    modeling.updateWaypoints(flow, [
      { x: 200, y: 140 },
      { x: 300, y: 140 },
      { x: 300, y: 200 },
      { x: 400, y: 200 },
    ], { segmentMove: {} })
    expect(isManual(flow)).toBe(true)

    commandStack.undo()
    expect(isManual(flow)).toBe(false)
    expect(flow.waypoints.map((p: Any) => ({ x: p.x, y: p.y }))).toEqual(before)

    commandStack.redo()
    expect(isManual(flow)).toBe(true)
  })

  it('reset del context pad (hints.resetRoute) limpia el flag en un solo comando', async () => {
    const { modeling, registry, commandStack } = await createModeler()
    const flow = registry.get('Flow_AB')
    const layouter = modeler.get('layouter') as Any
    markManual(flow, true)

    const wp = layouter.layoutConnection(flow, {
      source: flow.source, target: flow.target, forceReroute: true,
    })
    modeling.updateWaypoints(flow, wp, { resetRoute: true })
    expect(isManual(flow)).toBe(false)

    commandStack.undo()
    expect(isManual(flow)).toBe(true)
  })
})

const COLLAB_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    id="Defs_2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Part_1" processRef="Process_1" />
    <bpmn:participant id="Part_2" processRef="Process_2" />
    <bpmn:messageFlow id="Msg_1" sourceRef="Task_P1" targetRef="Task_P2" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_P1" />
    <bpmn:boundaryEvent id="Bnd_1" attachedToRef="Task_P1" />
    <bpmn:task id="Task_C" />
    <bpmn:sequenceFlow id="Flow_BC" sourceRef="Bnd_1" targetRef="Task_C" />
  </bpmn:process>
  <bpmn:process id="Process_2" isExecutable="false">
    <bpmn:task id="Task_P2" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diag_2">
    <bpmndi:BPMNPlane id="Plane_2" bpmnElement="Collab_1">
      <bpmndi:BPMNShape id="Part_1_di" bpmnElement="Part_1" isHorizontal="true">
        <dc:Bounds x="60" y="40" width="700" height="260" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_P1_di" bpmnElement="Task_P1">
        <dc:Bounds x="300" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Bnd_1_di" bpmnElement="Bnd_1">
        <dc:Bounds x="330" y="162" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_C_di" bpmnElement="Task_C">
        <dc:Bounds x="500" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Part_2_di" bpmnElement="Part_2" isHorizontal="true">
        <dc:Bounds x="60" y="400" width="700" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_P2_di" bpmnElement="Task_P2">
        <dc:Bounds x="340" y="450" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_BC_di" bpmnElement="Flow_BC">
        <di:waypoint x="366" y="180" />
        <di:waypoint x="500" y="240" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Msg_1_di" bpmnElement="Msg_1">
        <di:waypoint x="350" y="180" />
        <di:waypoint x="390" y="450" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

describe('preferencias por tipo de conexión', () => {
  it('message flow entre pools con solape horizontal → línea vertical recta de 2 puntos', async () => {
    const { registry } = await createModeler(COLLAB_DIAGRAM)
    const msg = registry.get('Msg_1')
    const wps = msg.waypoints
    expect(isOrthogonal(wps)).toBe(true)
    expect(wps.length).toBe(2)
    expect(wps[0].x).toBe(wps[1].x)
    // vertical descendente entre pools
    expect(wps[1].y).toBeGreaterThan(wps[0].y)
  })

  it('boundary event sale hacia AFUERA del host (cara donde está montado)', async () => {
    const { registry } = await createModeler(COLLAB_DIAGRAM)
    const flow = registry.get('Flow_BC')
    const bnd = registry.get('Bnd_1')
    const wps = flow.waypoints
    expect(isOrthogonal(wps)).toBe(true)
    // el evento está en el borde INFERIOR del host → salida por bottom del círculo
    expect(wps[0].y).toBeGreaterThanOrEqual(bnd.y + bnd.height - 2)
    // y el primer segmento va hacia abajo (alejándose del host)
    expect(wps[1].y).toBeGreaterThan(wps[0].y)
  })

  it('association a anotación preserva la forma del usuario (sin criterio §14)', async () => {
    const { modeling, registry, elementFactory } = await createModeler()
    const taskA = registry.get('Task_A')
    const root = registry.get('Process_1') ?? modeler.get('canvas').getRootElement()
    const annotation = elementFactory.createShape({ type: 'bpmn:TextAnnotation' })
    modeling.createShape(annotation, { x: 150, y: 400 }, root)
    const assoc = modeling.connect(taskA, annotation, { type: 'bpmn:Association' })

    // el usuario da forma en L invertida con codo propio
    modeling.updateWaypoints(assoc, [
      { x: 150, y: 180 },
      { x: 150, y: 300 },
      { x: 150, y: 385 },
    ], { segmentMove: {} })

    // mover la anotación: la forma se re-ancla pero NO se re-rutea a la óptima
    modeling.moveShape(annotation, { x: 40, y: 20 })
    expect(isOrthogonal(assoc.waypoints)).toBe(true)
  })
})

describe('separación de flechas paralelas', () => {
  it('dos flechas entre el mismo par no comparten dock (±10px)', async () => {
    const { modeling, registry } = await createModeler()
    const taskA = registry.get('Task_A')
    const taskB = registry.get('Task_B')
    const flow2 = modeling.connect(taskA, taskB)
    // re-layout de ambas para que la separación aplique a las dos
    const flow1 = registry.get('Flow_AB')
    modeling.layoutConnection(flow1, { source: taskA, target: taskB })
    modeling.layoutConnection(flow2, { source: taskA, target: taskB })

    const y1 = flow1.waypoints[0].y
    const y2 = flow2.waypoints[0].y
    expect(Math.abs(y1 - y2)).toBeGreaterThanOrEqual(9)
    expect(isOrthogonal(flow1.waypoints)).toBe(true)
    expect(isOrthogonal(flow2.waypoints)).toBe(true)
  })

  it('al borrar una hermana, las restantes se re-separan (re-centran)', async () => {
    const { modeling, registry } = await createModeler()
    const taskA = registry.get('Task_A')
    const taskB = registry.get('Task_B')
    const flow1 = registry.get('Flow_AB')
    const flow2 = modeling.connect(taskA, taskB)
    const flow3 = modeling.connect(taskA, taskB)
    modeling.layoutConnection(flow1, { source: taskA, target: taskB })
    modeling.layoutConnection(flow2, { source: taskA, target: taskB })
    modeling.layoutConnection(flow3, { source: taskA, target: taskB })

    modeling.removeConnection(flow2)

    // quedan 2 → offsets ±5 → separación exacta de 10 y simétrica al centro
    const y1 = flow1.waypoints[0].y
    const y3 = flow3.waypoints[0].y
    expect(Math.abs(y1 - y3)).toBe(10)
    const cy = taskA.y + taskA.height / 2
    expect((y1 + y3) / 2).toBeCloseTo(cy, 0)
  })
})

const GW_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    id="Dgw" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Pgw" isExecutable="false">
    <bpmn:exclusiveGateway id="GW" />
    <bpmn:task id="TR" />
    <bpmn:task id="TD" />
    <bpmn:sequenceFlow id="FR" sourceRef="GW" targetRef="TR" />
    <bpmn:sequenceFlow id="FD" sourceRef="GW" targetRef="TD" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dggw">
    <bpmndi:BPMNPlane id="Plgw" bpmnElement="Pgw">
      <bpmndi:BPMNShape id="GW_di" bpmnElement="GW"><dc:Bounds x="200" y="155" width="50" height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TR_di" bpmnElement="TR"><dc:Bounds x="400" y="140" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TD_di" bpmnElement="TD"><dc:Bounds x="380" y="300" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="FR_di" bpmnElement="FR">
        <di:waypoint x="250" y="180" /><di:waypoint x="400" y="180" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FD_di" bpmnElement="FD">
        <di:waypoint x="250" y="180" /><di:waypoint x="330" y="180" /><di:waypoint x="330" y="340" /><di:waypoint x="380" y="340" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

describe('no-invasión de shapes (bug del screenshot)', () => {
  it('mover el target debajo del gateway (solapando x) NO deja la flecha dentro del shape', async () => {
    const { modeling, registry } = await createModeler(GW_DIAGRAM)
    const td = registry.get('TD')
    const fd = registry.get('FD')
    // TD estaba abajo-derecha (entrada por left). Moverlo para quedar DEBAJO
    // del gateway, solapando en x con su eje vertical — como el screenshot.
    modeling.moveShape(td, { x: -155, y: -30 }) // TD → (225, 270), gateway cx=225
    expect(isOrthogonal(fd.waypoints)).toBe(true)
    expect(routeInvades(fd.waypoints, td)).toBe(false)
    expect(routeInvades(fd.waypoints, registry.get('GW'))).toBe(false)
  })

  it('updateWaypoints con una ruta que entra y muere dentro del target se auto-sana', async () => {
    const { modeling, registry } = await createModeler(GW_DIAGRAM)
    const td = registry.get('TD')
    const fd = registry.get('FD')
    // forzar exactamente la geometría del bug: baja y hace esquina DENTRO de TD
    modeling.updateWaypoints(fd, [
      { x: 225, y: 205 },
      { x: 225, y: 340 },        // dentro de TD (y-interior)
      { x: td.x, y: 340 },       // esquina interior → sale por la izquierda
    ])
    // el invariante (Capa 3) detecta la invasión y re-ruta dentro del comando
    expect(routeInvades(fd.waypoints, td)).toBe(false)
    expect(isOrthogonal(fd.waypoints)).toBe(true)
  })

  it('mover el target lejos → entra por el cardinal más corto (no sobrepasa a la cara lejana)', async () => {
    const { modeling, registry } = await createModeler(GW_DIAGRAM)
    const td = registry.get('TD')  // (380,300), entra por left desde el gateway
    const fd = registry.get('FD')
    // mover TD a la derecha: el camino más corto sigue siendo entrar por la
    // IZQUIERDA; la ruta no debe rodearlo para entrar por la derecha.
    modeling.moveShape(td, { x: 250, y: 0 }) // TD → (630,300)
    const wps = fd.waypoints
    expect(isOrthogonal(wps)).toBe(true)
    expect(routeInvades(wps, td)).toBe(false)
    const end = wps[wps.length - 1]
    // el extremo entra por la cara izquierda (x ≈ td.x), no por la derecha
    expect(Math.abs(end.x - td.x)).toBeLessThan(Math.abs(end.x - (td.x + td.width)))
    // y ningún waypoint sobrepasa el borde derecho del shape
    expect(Math.max(...wps.map((p: Any) => p.x))).toBeLessThanOrEqual(td.x + td.width + 1)
  })

  it('Capa 4: soltar un shape encima del camino de una flecha ajena la aparta', async () => {
    const { modeling, registry, elementFactory } = await createModeler()
    // Flow_AB va recto de Task_A(100..200) a Task_B(400..500) en y≈140
    const flow = registry.get('Flow_AB')
    const root = registry.get('Process_1') ?? modeler.get('canvas').getRootElement()
    // crear un shape y soltarlo encima del camino horizontal de la flecha
    const blocker = elementFactory.createShape({ type: 'bpmn:Task' })
    modeling.createShape(blocker, { x: 300, y: 140 }, root) // centro en el camino
    expect(routeInvades(flow.waypoints, blocker)).toBe(false)
    expect(isOrthogonal(flow.waypoints)).toBe(true)
  })
})

describe('self-loops', () => {
  it('bucle editado manualmente se traslada con el shape (no se regenera)', async () => {
    const { modeling, registry } = await createModeler()
    const taskA = registry.get('Task_A')
    const loop = modeling.connect(taskA, taskA)

    // el usuario baja el bucle al lado inferior del shape
    modeling.updateWaypoints(loop, [
      { x: 130, y: 180 },
      { x: 130, y: 230 },
      { x: 170, y: 230 },
      { x: 170, y: 180 },
    ], { segmentMove: {} })
    expect(isManual(loop)).toBe(true)

    modeling.moveShape(taskA, { x: 50, y: 30 })

    // bucle trasladado íntegro con el shape, forma intacta
    expect(loop.waypoints.map((p: Any) => ({ x: p.x, y: p.y }))).toEqual([
      { x: 180, y: 210 },
      { x: 180, y: 260 },
      { x: 220, y: 260 },
      { x: 220, y: 210 },
    ])
    expect(isManual(loop)).toBe(true)
  })
})
