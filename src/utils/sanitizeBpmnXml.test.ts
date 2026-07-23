import { describe, it, expect } from 'vitest'
import { sanitizeBpmnXml, hasNonFiniteCoords } from './sanitizeBpmnXml'

// Fragmento fiel a la corrupción real de "se corrompio, abro ticket": una
// Association cuyo sourceRef apunta a OTRA Association, con DI de waypoints NaN.
const CORRUPT = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
    <bpmn:textAnnotation id="TextAnnotation_1cnwgi8"><bpmn:text>nota A</bpmn:text></bpmn:textAnnotation>
    <bpmn:Association id="Association_13187ou" associationDirection="None" sourceRef="Activity_109ie3q" targetRef="TextAnnotation_1cnwgi8" />
    <bpmn:textAnnotation id="TextAnnotation_1lggpbp"><bpmn:text>nota B</bpmn:text></bpmn:textAnnotation>
    <bpmn:Association id="Association_0smwwgo" associationDirection="None" sourceRef="Association_13187ou" targetRef="TextAnnotation_1lggpbp" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Activity_109ie3q" name="Modifica" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Activity_109ie3q_di" bpmnElement="Activity_109ie3q">
        <dc:Bounds x="1015" y="510" width="90" height="60" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Association_13187ou_di" bpmnElement="Association_13187ou">
        <di:waypoint x="1060" y="570" />
        <di:waypoint x="910" y="580" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Association_0smwwgo_di" bpmnElement="Association_0smwwgo">
        <di:waypoint x="NaN" y="NaN" />
        <di:waypoint x="3084" y="NaN" />
        <di:waypoint x="3020" y="167" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="TextAnnotation_1lggpbp_di" bpmnElement="TextAnnotation_1lggpbp">
        <dc:Bounds x="2970" y="167" width="100" height="112" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const CLEAN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Activity_1" name="T" />
    <bpmn:SequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1"><dc:Bounds x="200" y="90" width="90" height="60" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="136" y="118" /><di:waypoint x="200" y="120" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

describe('hasNonFiniteCoords', () => {
  it('detecta NaN en waypoints', () => {
    expect(hasNonFiniteCoords(CORRUPT)).toBe(true)
  })
  it('detecta Infinity en bounds', () => {
    expect(hasNonFiniteCoords('<dc:Bounds x="0" y="0" width="Infinity" height="10" />')).toBe(true)
  })
  it('es false en XML sano', () => {
    expect(hasNonFiniteCoords(CLEAN)).toBe(false)
  })
  it('no confunde texto que contenga "NaN" como subcadena', () => {
    // "Banana" contiene 'ana' pero no coincide con el patrón de atributo
    expect(hasNonFiniteCoords('<bpmn:text>Plan Banana</bpmn:text>')).toBe(false)
  })
})

describe('sanitizeBpmnXml', () => {
  it('elimina la Association cuyo source es otra Association', () => {
    const r = sanitizeBpmnXml(CORRUPT)
    expect(r.removedConnections).toContain('Association_0smwwgo')
    expect(r.xml).not.toContain('Association_0smwwgo"')
    // la association válida (source = task) se conserva
    expect(r.xml).toContain('id="Association_13187ou"')
  })

  it('elimina la DI de la association inválida', () => {
    const r = sanitizeBpmnXml(CORRUPT)
    expect(r.xml).not.toContain('bpmnElement="Association_0smwwgo"')
  })

  it('no deja NINGUNA coordenada no finita', () => {
    const r = sanitizeBpmnXml(CORRUPT)
    expect(hasNonFiniteCoords(r.xml)).toBe(false)
    expect(r.xml).not.toContain('NaN')
  })

  it('marca changed=true y conserva el diagrama importable (task + edge válida)', () => {
    const r = sanitizeBpmnXml(CORRUPT)
    expect(r.changed).toBe(true)
    expect(r.xml).toContain('id="Activity_109ie3q"')
    expect(r.xml).toContain('bpmnElement="Activity_109ie3q"')
  })

  it('es idempotente y no toca un XML sano', () => {
    const r = sanitizeBpmnXml(CLEAN)
    expect(r.changed).toBe(false)
    expect(r.xml).toBe(CLEAN)
    expect(r.removedConnections).toHaveLength(0)
    expect(r.strippedEdgeDi).toHaveLength(0)
  })

  it('descarta la DI de una arista con waypoint NaN aunque la conexión sea válida', () => {
    const xml = `<bpmndi:BPMNDiagram><bpmndi:BPMNPlane>
      <bpmndi:BPMNEdge id="Flow_x_di" bpmnElement="Flow_x"><di:waypoint x="10" y="NaN" /><di:waypoint x="20" y="30" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`
    const r = sanitizeBpmnXml(xml)
    expect(r.strippedEdgeDi).toContain('Flow_x')
    expect(r.xml).not.toContain('BPMNEdge')
    expect(hasNonFiniteCoords(r.xml)).toBe(false)
  })
})
