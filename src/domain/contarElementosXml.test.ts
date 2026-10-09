import { describe, expect, it } from 'vitest'
import { construirXml, crearModdle } from './bpmn-model/construirXml'
import { contarElementos, editarXml } from './bpmn-model/editar'
import { MODELO_POOLS_CARRILES, MODELO_SIMPLE, MODELO_SUBPROCESO } from './bpmn-model/fixtures'
import { contarElementosXml } from './contarElementosXml'

/** El contador del conector, sobre el árbol de moddle: la referencia. */
async function referencia(xml: string): Promise<number> {
  const { rootElement } = await crearModdle().fromXML(xml)
  return contarElementos(rootElement)
}

describe('contarElementosXml', () => {
  it.each([
    ['simple', MODELO_SIMPLE],
    ['pools y carriles', MODELO_POOLS_CARRILES],
    ['subproceso expandido', MODELO_SUBPROCESO],
  ])('da lo mismo que el contador del conector: %s', async (_n, modelo) => {
    const { xml, elementos } = await construirXml(modelo)
    expect(contarElementosXml(xml)).toBe(elementos)
    expect(contarElementosXml(xml)).toBe(await referencia(xml))
  })

  it('también después de editar: pool y carril nuevos, mensajes', async () => {
    const { xml: base } = await construirXml(MODELO_POOLS_CARRILES)
    const pool = MODELO_POOLS_CARRILES.pools[0]
    const { xml, elementos } = await editarXml(base, [
      { op: 'agregar_pool', id: 'Externo', nombre: 'Externo', carriles: [{ id: 'ext_a', nombre: 'A' }] },
      { op: 'agregar_nodo', id: 'recibir_x', tipo: 'tarea_recepcion', nombre: 'Recibir', pool: 'Externo', carril: 'ext_a' },
      { op: 'conectar', desde: pool.nodos[1].id, hasta: 'recibir_x' },
    ])
    expect(contarElementosXml(xml)).toBe(elementos)
  })

  it('ignora anotaciones, DI, LaneSet, cierres y extensiones; no distingue mayúsculas', () => {
    const xml = `<bpmn:definitions>
      <bpmn:collaboration id="c"><bpmn:participant id="p" processRef="pr" /><bpmn:MessageFlow id="m" sourceRef="a" targetRef="p" /></bpmn:collaboration>
      <bpmn:process id="pr">
        <bpmn:laneSet id="ls"><bpmn:lane id="l"><bpmn:childLaneSet id="cls"><bpmn:lane id="l2"/></bpmn:childLaneSet></bpmn:lane></bpmn:laneSet>
        <bpmn:task id="a"><bpmn:extensionElements><bizagi:Task x="1"/><flujo:lane/></bpmn:extensionElements></bpmn:task>
        <bpmn:SequenceFlow id="f" sourceRef="a" targetRef="e" />
        <bpmn:endEvent id="e"></bpmn:endEvent>
        <bpmn:textAnnotation id="n" /><bpmn:association id="as" /><bpmn:group id="g" />
      </bpmn:process>
      <bpmndi:BPMNDiagram><bpmndi:BPMNPlane><bpmndi:BPMNShape id="a_di" bpmnElement="a" /></bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
    </bpmn:definitions>`
    // participant, MessageFlow, lane ×2, task, SequenceFlow, endEvent
    expect(contarElementosXml(xml)).toBe(7)
  })

  it('XML vacío → 0', () => {
    expect(contarElementosXml('')).toBe(0)
  })
})
