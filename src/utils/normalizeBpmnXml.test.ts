import { describe, it, expect } from 'vitest'
import { BpmnModdle } from 'bpmn-moddle'
import { normalizeBpmnXml, forceCanonicalBpmnPrefix } from './normalizeBpmnXml'

/**
 * Serialización canónica (ADR §6.4): un solo dialecto de XML persistido.
 * El dialecto "sin prefijo" (xmlns default) debe re-serializarse a `bpmn:`.
 */

const NO_PREFIX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Defs_np" targetNamespace="http://bpmn.io/schema/bpmn">
  <collaboration id="Collab_np">
    <participant id="Part_np" name="Pool sin prefijo" processRef="Proc_np" />
  </collaboration>
  <process id="Proc_np" isExecutable="false">
    <startEvent id="Start_np" />
  </process>
  <bpmndi:BPMNDiagram id="Diag_np">
    <bpmndi:BPMNPlane id="Plane_np" bpmnElement="Collab_np">
      <bpmndi:BPMNShape id="Part_np_di" bpmnElement="Part_np" isHorizontal="true">
        <dc:Bounds x="10" y="10" width="600" height="250" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`

describe('normalizeBpmnXml', () => {
  it('re-serializa el dialecto sin prefijo al canónico bpmn: conservando ids y DI', async () => {
    const out = await normalizeBpmnXml(NO_PREFIX_XML)
    expect(out).toContain('<bpmn:definitions')
    expect(out).toContain('<bpmn:participant')
    expect(out).toContain('id="Part_np"')
    expect(out).toContain('bpmndi:BPMNShape')
    expect(out).not.toMatch(/<participant\b/) // el dialecto viejo no sobrevive
  })

  it('es idempotente: normalizar lo canónico da lo mismo', async () => {
    const once = await normalizeBpmnXml(NO_PREFIX_XML)
    const twice = await normalizeBpmnXml(once)
    expect(twice).toBe(once)
  })

  it('preserva atributos flujo:* (extensión propia)', async () => {
    const withFlujo = NO_PREFIX_XML.replace(
      '<startEvent id="Start_np" />',
      '<subProcess id="Sub_np" xmlns:flujo="http://flujo.app/schema/bpmn" flujo:linkedDiagram="d-123" />'
    )
    const out = await normalizeBpmnXml(withFlujo)
    expect(out).toContain('flujo:linkedDiagram="d-123"')
  })

  it('preserva flujo:linkedImages (biblioteca) en el round-trip', async () => {
    const withImgs = NO_PREFIX_XML.replace(
      '<startEvent id="Start_np" />',
      '<userTask id="U_np" xmlns:flujo="http://flujo.app/schema/bpmn" flujo:linkedImages="img-1,img-2" />'
    )
    const out = await normalizeBpmnXml(withImgs)
    expect(out).toContain('flujo:linkedImages="img-1,img-2"')
  })

  it('rechaza basura no-BPMN', async () => {
    await expect(normalizeBpmnXml('<html><body>no</body></html>')).rejects.toThrow()
  })

  it('forceCanonicalBpmnPrefix: un doc legacy re-serializa canónico tras el fix (camino del modeler)', async () => {
    // Simula el flujo del canvas: importar XML sin prefijo → forzar prefijo
    // en las definitions vivas → el próximo saveXML sale canónico.
    const moddle = new BpmnModdle()
    const { rootElement } = await moddle.fromXML(NO_PREFIX_XML)
    forceCanonicalBpmnPrefix(rootElement)
    const { xml: out } = await moddle.toXML(rootElement, { format: true })
    expect(out).toContain('<bpmn:definitions')
    expect(out).not.toMatch(/<participant\b/)
  })
})
