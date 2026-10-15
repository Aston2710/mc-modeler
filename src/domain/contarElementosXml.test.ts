import { describe, expect, it } from 'vitest'
import { contarElementosXml } from './contarElementosXml'

// La equivalencia con `contarElementos` del conector (sobre el árbol de moddle)
// se prueba en la rama del conector, que es donde vive ese contador.
describe('contarElementosXml', () => {
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
