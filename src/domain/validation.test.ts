// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Modeler from 'bpmn-js/lib/Modeler'
import flujoModdle from '../bpmn/moddle/flujo.json'
import { installJsdomSvgShims } from '../bpmn/testing/jsdomSvgShims'
import { validateDiagram } from './validation'
import { construirXml } from './bpmn-model/construirXml'
import type { ModeloSemantico } from './bpmn-model/modelo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const t = (k: string) => k

let container: HTMLDivElement
let modeler: Any

beforeEach(() => {
  installJsdomSvgShims()
  container = document.createElement('div')
  document.body.appendChild(container)
  modeler = new Modeler({ container, moddleExtensions: { flujo: flujoModdle } })
})
afterEach(() => { modeler?.destroy(); container.remove() })

async function validar(modelo: ModeloSemantico) {
  const { xml } = await construirXml(modelo)
  await modeler.importXML(xml)
  return validateDiagram(modeler.get('elementRegistry'), t)
}

describe('validateDiagram', () => {
  it('avisa de inicio y fin que faltan en un proceso DENTRO de un pool', async () => {
    const r = await validar({
      pools: [{ id: 'P', nombre: 'Pool', nodos: [{ id: 'a', tipo: 'tarea' }] }],
    })
    const codigos = r.map((x) => `${x.code}:${x.elementId}`)
    expect(codigos).toContain('MISSING_START_EVENT:P')
    expect(codigos).toContain('MISSING_END_EVENT:P')
  })

  it('un pool completo no da avisos de inicio ni fin', async () => {
    const r = await validar({
      pools: [{ id: 'P', nombre: 'Pool', nodos: [{ id: 's', tipo: 'inicio' }, { id: 'e', tipo: 'fin' }] }],
      flujos: [{ desde: 's', hasta: 'e' }],
    })
    expect(r.filter((x) => x.code.startsWith('MISSING_'))).toEqual([])
  })

  it('cada pool se comprueba por separado', async () => {
    const r = await validar({
      pools: [
        { id: 'A', nombre: 'A', nodos: [{ id: 's', tipo: 'inicio' }, { id: 'e', tipo: 'fin' }] },
        { id: 'B', nombre: 'B', nodos: [{ id: 'x', tipo: 'tarea' }] },
      ],
      flujos: [{ desde: 's', hasta: 'e' }],
    })
    const faltan = r.filter((x) => x.code.startsWith('MISSING_')).map((x) => x.elementId)
    expect(new Set(faltan)).toEqual(new Set(['B']))
  })

  it('sigue comprobando un proceso suelto, sin pool', async () => {
    await modeler.importXML(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="D" targetNamespace="x">
  <bpmn:process id="Proc"><bpmn:task id="t" /></bpmn:process>
  <bpmndi:BPMNDiagram id="Dg"><bpmndi:BPMNPlane id="Pl" bpmnElement="Proc">
    <bpmndi:BPMNShape id="t_di" bpmnElement="t"><dc:Bounds x="100" y="100" width="90" height="60" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`)
    const r = validateDiagram(modeler.get('elementRegistry'), t)
    expect(r.map((x) => x.code)).toEqual(expect.arrayContaining(['MISSING_START_EVENT', 'MISSING_END_EVENT', 'DISCONNECTED_ELEMENT']))
  })

  it('avisa, no lanza: el diagrama se puede guardar igual', async () => {
    await expect(validar({ pools: [{ id: 'P', nombre: 'P', nodos: [] }] })).resolves.toBeInstanceOf(Array)
  })
})
