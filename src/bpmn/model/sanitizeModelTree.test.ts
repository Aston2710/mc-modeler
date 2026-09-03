// @vitest-environment jsdom
/**
 * El guardado no se detiene por una pieza mal formada (EXP-022, PLAN-035).
 *
 * Con un bpmn-js real, porque lo que se afirma es el comportamiento del
 * serializer de moddle-xml: una prueba con dobles no probaría nada aquí.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// @ts-ignore
import Modeler from 'bpmn-js/lib/Modeler'
import flujoModdle from '../moddle/flujo.json'
import { installJsdomSvgShims } from '../testing/jsdomSvgShims'
import { sanitizeModelTree, describeReport } from './sanitizeModelTree'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:flujo="http://flujo.app/schema/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:task id="Task_1" name="Enviar solicitud"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:task>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="270" y="88" width="100" height="60" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="216" y="118" /><di:waypoint x="270" y="118" />
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

const proceso = () => modeler.get('elementRegistry').get('Task_1').businessObject.$parent
const guardar = async (): Promise<string> => {
  try {
    await modeler.saveXML({ format: true })
    return ''
  } catch (e) {
    return (e as Error).message
  }
}

describe('el mecanismo del fallo', () => {
  it('un objeto plano en el árbol da EXACTAMENTE el error de producción', async () => {
    proceso().flowElements.push({ $type: 'bpmn:Task', id: 'Impostor_1', name: 'plano' })
    // Este es, palabra por palabra, el mensaje que vio la usuaria el 2026-09-02.
    expect(await guardar()).toContain("Cannot read properties of undefined (reading 'isGeneric')")
  })

  it('un hueco da un mensaje DISTINTO — es lo que permite diagnosticar por el texto', async () => {
    proceso().flowElements.push(undefined)
    const msg = await guardar()
    expect(msg).toContain("reading '$descriptor'")
    expect(msg).not.toContain('isGeneric')
  })

  it('el guardado es todo o nada: una pieza mala tumba el diagrama COMPLETO', async () => {
    proceso().flowElements.push({ $type: 'bpmn:Task', id: 'Impostor_1' })
    expect(await guardar()).not.toBe('')
    // No es que se pierda el impostor: no se escribe NADA.
  })
})

describe('sanitizeModelTree', () => {
  it('reconstruye la pieza plana y el guardado sale adelante', async () => {
    proceso().flowElements.push({ $type: 'bpmn:Task', id: 'Impostor_1', name: 'plano' })
    expect(await guardar()).not.toBe('')

    const r = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    expect(r.changed).toBe(true)
    expect(r.repaired).toBe(1)
    expect(r.removed).toBe(0)

    expect(await guardar()).toBe('')
  })

  it('conserva los datos que la pieza aún llevaba', async () => {
    proceso().flowElements.push({ $type: 'bpmn:Task', id: 'Impostor_1', name: 'Revisar factura' })
    sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())

    const { xml } = await modeler.saveXML({ format: true })
    expect(xml).toContain('Impostor_1')
    expect(xml).toContain('Revisar factura')
  })

  it('quita lo que no se puede reconstruir, y lo dice', async () => {
    proceso().flowElements.push({ $type: 'inventado:NoExiste', id: 'X_1' })
    const r = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())

    expect(r.removed).toBe(1)
    expect(r.repaired).toBe(0)
    expect(r.findings[0].action).toBe('removed')
    expect(r.findings[0].type).toBe('inventado:NoExiste')
    expect(await guardar()).toBe('')
  })

  it('también cierra los huecos', async () => {
    proceso().flowElements.push(undefined)
    const r = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    expect(r.changed).toBe(true)
    expect(await guardar()).toBe('')
  })

  it('repara varias piezas a la vez, en distintas ramas', async () => {
    proceso().flowElements.push({ $type: 'bpmn:Task', id: 'Impostor_1' })
    proceso().flowElements.push({ $type: 'bpmn:ExclusiveGateway', id: 'Impostor_2' })
    proceso().flowElements.push({ $type: 'inventado:NoExiste', id: 'X_1' })

    const r = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    expect(r.repaired).toBe(2)
    expect(r.removed).toBe(1)
    expect(await guardar()).toBe('')
  })

  it('no toca nada en un árbol sano, y es idempotente', async () => {
    const primera = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    expect(primera.changed).toBe(false)
    expect(primera.findings).toHaveLength(0)

    const { xml: antes } = await modeler.saveXML({ format: true })
    const segunda = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    expect(segunda.changed).toBe(false)
    const { xml: despues } = await modeler.saveXML({ format: true })
    expect(despues).toBe(antes)
  })

  it('no recorre las referencias — no las confunde con contenido roto', async () => {
    // `sourceRef`/`targetRef` de un flujo apuntan a piezas que ya se visitan por
    // su rama de contenido. Si el recorrido las siguiera, contaría de más.
    const r = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    expect(r.findings).toHaveLength(0)
  })

  it('el parte no filtra contenido del dominio: solo tipos', async () => {
    proceso().flowElements.push({ $type: 'bpmn:Task', id: 'Impostor_1', name: 'Nombre confidencial' })
    const r = sanitizeModelTree(modeler.get('moddle'), modeler.getDefinitions())
    const linea = describeReport(r)

    expect(linea).toBe('repaired:bpmn:Task')
    expect(linea).not.toContain('Nombre confidencial')
  })

  it('sin raíz sana no inventa nada', () => {
    const r = sanitizeModelTree(modeler.get('moddle'), null)
    expect(r.changed).toBe(false)
    expect(r.findings).toHaveLength(0)
  })
})
