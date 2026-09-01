/**
 * Cómo extender el metamodelo BPMN sin corromper el XML canónico.
 *
 * EL PROBLEMA. Declarar `extends: ["bpmn:X"]` en `flujo.json` hace que las
 * instancias de `bpmn:X` se serialicen con el nombre del TIPO en vez del nombre
 * canónico del elemento: `<bpmn:SequenceFlow>` en lugar de
 * `<bpmn:sequenceFlow>`. XML distingue mayúsculas, así que el resultado no
 * valida contra el XSD de BPMN 2.0 y otras herramientas pueden rechazarlo.
 *
 * Importa más de lo que parece: el XML canónico **es la fuente de verdad** del
 * proyecto (DEC-001).
 *
 * ESTO YA ESTÁ PASANDO EN PRODUCCIÓN. Medido el 2026-08-23 sobre los 177
 * diagramas: 139 llevan `<bpmn:SequenceFlow>`, 40 `<bpmn:Group>` y 20
 * `<bpmn:SubProcess>`. Ninguno lleva la forma canónica. Viene de las extensiones
 * `manualRoute`, `groupColor`/`phaseColor` y `linkedDiagram`. Está documentado
 * como incidente aparte; **estas pruebas no lo arreglan, lo fijan** para que se
 * vea y para que nadie añada uno más sin darse cuenta.
 *
 * LA VÍA SEGURA es un tipo suelto dentro de `bpmn:extensionElements`, que es
 * justo para lo que existe: no toca el descriptor de ningún tipo de bpmn.
 */
import { describe, it, expect } from 'vitest'
// bpmn-moddle 10 exporta con nombre, no por defecto.
// @ts-ignore — sin tipos publicados
import { BpmnModdle } from 'bpmn-moddle'
import flujoModdle from './flujo.json'

/**
 * XML rico A PROPÓSITO: contiene una instancia de cada tipo que el proyecto
 * extiende. Una versión más pobre daba falsos aprobados — un tipo ausente del
 * documento no puede romper su propia serialización.
 */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Part_1" name="Pool" processRef="Proc_1" />
  </bpmn:collaboration>
  <bpmn:process id="Proc_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_1" name="Tarea" />
    <bpmn:subProcess id="Sub_1" name="Subproceso" />
    <bpmn:endEvent id="End_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:group id="Group_1" categoryValueRef="Cat_1" />
    <bpmn:textAnnotation id="Note_1"><bpmn:text>Nota</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_1" sourceRef="Note_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmn:category id="Cat_root"><bpmn:categoryValue id="Cat_1" value="G" /></bpmn:category>
  <bpmndi:BPMNDiagram id="Diag_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collab_1">
      <bpmndi:BPMNShape id="Part_1_di" bpmnElement="Part_1" isHorizontal="true">
        <dc:Bounds x="10" y="10" width="600" height="250" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

/** Nombres de elemento del BPMN canónico: todos con minúscula inicial. */
const CANONICOS = [
  '<bpmn:definitions', '<bpmn:collaboration', '<bpmn:participant', '<bpmn:process',
  '<bpmn:startEvent', '<bpmn:task', '<bpmn:subProcess', '<bpmn:endEvent',
  '<bpmn:sequenceFlow', '<bpmn:group', '<bpmn:textAnnotation', '<bpmn:association',
]

async function roundtrip(paquete?: object): Promise<string> {
  const moddle = paquete ? new BpmnModdle({ flujo: paquete }) : new BpmnModdle()
  const { rootElement } = await moddle.fromXML(XML)
  const { xml } = await moddle.toXML(rootElement)
  // moddle tipa `xml` como opcional; en un roundtrip correcto siempre viene.
  return xml ?? ''
}

/** Paquete de una sola sonda que extiende el tipo indicado. */
const sonda = (extiende: string) => ({
  name: 'Prueba',
  uri: 'http://flujo.app/schema/prueba',
  prefix: 'flujo',
  associations: [],
  types: [{ name: 'Sonda', extends: [extiende], properties: [{ name: 'sonda', isAttr: true, type: 'String' }] }],
})

describe('serialización canónica', () => {
  it('sin extensiones el roundtrip es canónico (control)', async () => {
    const xml = await roundtrip()
    for (const c of CANONICOS) expect(xml, `control rompió ${c}`).toContain(c)
  })
})

describe('`extends` sobre un tipo CONCRETO rompe su nombre de elemento', () => {
  // Se afirma la rotura, no la ausencia de rotura: es la realidad medida. Si
  // algún día moddle cambia o se corrige el enfoque, estas pruebas fallarán y
  // avisarán de que hay que actualizar el incidente.
  it.each([
    ['bpmn:Definitions', '<bpmn:definitions', '<bpmn:Definitions'],
    ['bpmn:Process', '<bpmn:process', '<bpmn:Process'],
    ['bpmn:Collaboration', '<bpmn:collaboration', '<bpmn:Collaboration'],
    ['bpmn:Group', '<bpmn:group', '<bpmn:Group'],
    ['bpmn:SubProcess', '<bpmn:subProcess', '<bpmn:SubProcess'],
    ['bpmn:SequenceFlow', '<bpmn:sequenceFlow', '<bpmn:SequenceFlow'],
  ])('extender %s produce %s en vez de %s', async (tipo, canonico, roto) => {
    const xml = await roundtrip(sonda(tipo))
    expect(xml).toContain(roto)
    expect(xml).not.toContain(canonico)
  })

  it('extender un tipo ABSTRACTO (bpmn:FlowNode) sí es seguro', async () => {
    // Es la excepción, y por eso `flujo:linkedImages` cuelga de aquí: FlowNode
    // no se serializa nunca por sí mismo, solo sus concreciones.
    const xml = await roundtrip(sonda('bpmn:FlowNode'))
    for (const c of CANONICOS) expect(xml, `FlowNode rompió ${c}`).toContain(c)
  })
})

describe('la vía segura: tipo suelto en extensionElements', () => {
  it('el paquete real del proyecto no rompe la raíz ni el proceso', async () => {
    // `DocumentMeta` se declara con `superClass: ["Element"]`, sin `extends`, y
    // por tanto no toca el descriptor de ningún tipo de bpmn.
    const xml = await roundtrip(flujoModdle)
    expect(xml).toContain('<bpmn:definitions')
    expect(xml).toContain('<bpmn:process')
    expect(xml).toContain('<bpmn:collaboration')
    expect(xml).toContain('<bpmn:participant')
    expect(xml).toContain('<bpmn:startEvent')
    expect(xml).toContain('<bpmn:task')
  })

  it('DocumentMeta no altera ningún nombre de elemento por sí mismo', async () => {
    const docMeta = flujoModdle.types.find((t) => t.name === 'DocumentMeta')
    expect(docMeta, 'DocumentMeta debe existir en flujo.json').toBeDefined()
    const soloDoc = {
      name: 'Flujo',
      uri: 'http://flujo.app/schema/bpmn',
      prefix: 'flujo',
      associations: [],
      types: [docMeta!],
    }
    const xml = await roundtrip(soloDoc)
    for (const c of CANONICOS) expect(xml, `DocumentMeta rompió ${c}`).toContain(c)
  })
})
