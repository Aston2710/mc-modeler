// @vitest-environment jsdom
/**
 * Copiar y pegar por el portapapeles: la vuelta completa (PLAN-035).
 *
 * El módulo se auto-desactiva cuando el navegador no tiene portapapeles
 * asíncrono, y jsdom no lo tiene. Así que aquí la vuelta se hace a mano con
 * `serializeTree` / `deserializeTree`, que es EXACTAMENTE lo que el módulo
 * llama en producción — no un camino paralelo.
 *
 * El primer bloque **afirma el comportamiento roto de la dependencia original**.
 * Es deliberado, igual que en `moddle/extensionCasing.test.ts`: si algún día la
 * arreglan, estas pruebas fallarán y obligarán a volver aquí a comprobar si el
 * fork sigue haciendo falta, en vez de quedarse desactualizado en silencio.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// @ts-ignore
import Modeler from 'bpmn-js/lib/Modeler'
// @ts-ignore — la dependencia original, solo para contrastar
import { createReviver } from 'bpmn-js-native-copy-paste/lib/PasteUtil.js'
import flujoModdle from '../moddle/flujo.json'
import { installJsdomSvgShims } from '../testing/jsdomSvgShims'
import {
  serializeTree, deserializeTree, dropUnlabeled, type CopyPasteIssue,
} from './NativeCopyPasteModule'
import { sanitizeModelTree } from '../model/sanitizeModelTree'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/**
 * Mezcla de elementos tomada del diagrama real de EXP-022: pool con carriles,
 * tarea, compuerta, evento con definición, nota con asociación, y un objeto de
 * datos con imagen vinculada — que es el caso donde `$attrs` importa.
 */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:flujo="http://flujo.app/schema/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Pedido" processRef="Process_1" />
    <bpmn:textAnnotation id="TextAnnotation_1"><bpmn:text>Nota</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Association_1" associationDirection="None" sourceRef="Task_1" targetRef="TextAnnotation_1" flujo:manualRoute="true" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="Vendedor">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_2" name="Proveedor">
        <bpmn:flowNodeRef>Gateway_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Timer_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:task id="Task_1" name="Enviar solicitud">
      <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gateway_1" />
    <bpmn:exclusiveGateway id="Gateway_1" name="Faltantes">
      <bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="Timer_1" />
    <bpmn:intermediateCatchEvent id="Timer_1">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:timerEventDefinition id="Timer_def_1" />
    </bpmn:intermediateCatchEvent>
    <bpmn:dataObjectReference id="DataObjectReference_1" name="Detalle FC" dataObjectRef="DataObject_1" flujo:linkedImages="img-abc" />
    <bpmn:dataObject id="DataObject_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="700" height="300" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_1_di" bpmnElement="Lane_1" isHorizontal="true">
        <dc:Bounds x="130" y="50" width="670" height="150" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_2_di" bpmnElement="Lane_2" isHorizontal="true">
        <dc:Bounds x="130" y="200" width="670" height="150" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="270" y="88" width="100" height="60" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true">
        <dc:Bounds x="425" y="240" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Timer_1_di" bpmnElement="Timer_1">
        <dc:Bounds x="540" y="247" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="DataObjectReference_1_di" bpmnElement="DataObjectReference_1">
        <dc:Bounds x="302" y="270" width="36" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="TextAnnotation_1_di" bpmnElement="TextAnnotation_1">
        <dc:Bounds x="600" y="80" width="100" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="118" /><di:waypoint x="270" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="370" y="118" /><di:waypoint x="450" y="118" /><di:waypoint x="450" y="240" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="475" y="265" /><di:waypoint x="540" y="265" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Association_1_di" bpmnElement="Association_1">
        <di:waypoint x="370" y="110" /><di:waypoint x="600" y="105" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

let container: HTMLDivElement
let modeler: Any

beforeEach(async () => {
  installJsdomSvgShims()
  container = document.createElement('div')
  document.body.appendChild(container)
  modeler = new Modeler({ container, moddleExtensions: { flujo: flujoModdle } })
  await modeler.importXML(XML)
})

afterEach(() => {
  modeler?.destroy?.()
  container?.remove()
})

/** Captura el árbol que bpmn-js produce al copiar todo. */
function copiarTodo(): Any {
  const canvas = modeler.get('canvas')
  const root = canvas.getRootElement()
  let tree: Any = null
  modeler.get('eventBus').on('copyPaste.elementsCopied', 500, (e: Any) => { tree = e.tree })
  const elementos = modeler.get('elementRegistry').filter((el: Any) => el !== root && !el.labelTarget)
  modeler.get('copyPaste').copy(elementos)
  return tree
}

/** Nodos del árbol del modelo sin descriptor — los que rompen el guardado. */
function sinEtiqueta(): string[] {
  const malos: string[] = []
  const visto = new Set<Any>()
  function walk(o: Any) {
    if (!o || typeof o !== 'object' || visto.has(o)) return
    visto.add(o)
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (!o.$descriptor) { malos.push(o.$type ?? '(sin tipo)'); return }
    for (const p of o.$descriptor.properties) {
      if (p.isReference) continue
      walk(o.get ? o.get(p.name) : o[p.name])
    }
  }
  walk(modeler.getDefinitions())
  return malos
}

// ─────────────────────────────────────────────────────────────────────────────
describe('los agujeros de la dependencia original (se afirman a propósito)', () => {
  it('pierde $attrs: copiar un objeto de datos pierde su imagen vinculada', () => {
    const bo = modeler.get('elementRegistry').get('DataObjectReference_1').businessObject
    expect(bo.$attrs).toEqual({ 'flujo:linkedImages': 'img-abc' })

    const vuelta = JSON.parse(JSON.stringify(bo), createReviver(modeler.get('moddle')))

    // Esto es la pérdida silenciosa, y ocurre SIEMPRE.
    expect(vuelta.$attrs).toEqual({})
  })

  it('descarta en silencio lo que no reconoce', () => {
    const texto = JSON.stringify({ raro: { $type: 'inventado:NoExiste', id: 'X1' } })
    const out = JSON.parse(texto, createReviver(modeler.get('moddle')))
    expect(out.raro).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('nuestra vuelta del portapapeles', () => {
  it('conserva $attrs — la imagen vinculada sobrevive', () => {
    const bo = modeler.get('elementRegistry').get('DataObjectReference_1').businessObject
    const texto = serializeTree({ bo })
    const vuelta = deserializeTree(texto, modeler.get('moddle'), () => {})

    expect(vuelta.bo.$attrs).toEqual({ 'flujo:linkedImages': 'img-abc' })
  })

  it('avisa del tipo que no reconoce, en vez de tragárselo', () => {
    const issues: CopyPasteIssue[] = []
    const texto = serializeTree({ raro: { $type: 'inventado:NoExiste', id: 'X1' } })
    deserializeTree(texto, modeler.get('moddle'), (i) => issues.push(i))

    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('unknown-type')
    expect(issues[0].type).toBe('inventado:NoExiste')
  })

  it('el barrido final no deja pasar un objeto sin etiqueta', () => {
    const issues: CopyPasteIssue[] = []
    const arbol: Any = { descriptor: { businessObject: { $type: 'bpmn:Task', id: 'Plano_1' } } }

    dropUnlabeled(arbol, (i) => issues.push(i))

    expect(arbol.descriptor.businessObject).toBeUndefined()
    expect(issues[0].kind).toBe('unlabeled-dropped')
    expect(issues[0].type).toBe('bpmn:Task')
  })

  it('la vuelta completa del diagrama no deja piezas sin etiqueta ni rompe el guardado', async () => {
    const arbol = copiarTodo()
    expect(arbol).toBeTruthy()

    const issues: CopyPasteIssue[] = []
    const revivido = deserializeTree(serializeTree(arbol), modeler.get('moddle'), (i) => issues.push(i))

    modeler.get('copyPaste').paste({
      element: modeler.get('canvas').getRootElement(),
      point: { x: 1200, y: 900 },
      tree: revivido,
    })

    expect(issues).toHaveLength(0)
    expect(sinEtiqueta()).toEqual([])
    await expect(modeler.saveXML({ format: true })).resolves.toBeTruthy()
  })

  it('el texto ajeno al portapapeles se ignora', () => {
    expect(deserializeTree('hola', modeler.get('moddle'), () => {})).toBeNull()
    expect(deserializeTree('', modeler.get('moddle'), () => {})).toBeNull()
    expect(deserializeTree(null, modeler.get('moddle'), () => {})).toBeNull()
  })

  it('la pieza con id vuelve a ser UN objeto, no dos copias', () => {
    // bpmn-js enlaza la parte visual con la semántica; si al revivir salieran
    // dos objetos distintos, el pegado quedaría descuadrado.
    const bo = modeler.get('elementRegistry').get('Task_1').businessObject
    const vuelta = deserializeTree(serializeTree({ a: bo, b: bo }), modeler.get('moddle'), () => {})
    expect(vuelta.a).toBe(vuelta.b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('las dos capas juntas', () => {
  it('si algo se colara igual, el saneo del guardado lo recoge', async () => {
    // Simula el escenario de EXP-022 pase lo que pase en el pegado.
    const proceso = modeler.get('elementRegistry').get('Task_1').businessObject.$parent
    proceso.flowElements.push({ $type: 'bpmn:Task', id: 'Plano_1', name: 'colado' })

    await expect(modeler.saveXML({ format: true })).rejects.toThrow('isGeneric')

    const r = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    expect(r.repaired).toBe(1)
    await expect(modeler.saveXML({ format: true })).resolves.toBeTruthy()
  })
})
