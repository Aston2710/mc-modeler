// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Modeler from 'bpmn-js/lib/Modeler'
import flujoModdle from '../../bpmn/moddle/flujo.json'
import BizagiLayouter from '../../bpmn/connections/BizagiLayouter'
import { installJsdomSvgShims } from '../../bpmn/testing/jsdomSvgShims'
import { construirXml } from './construirXml'
import { editarXml, ErrorEdicion } from './editar'
import { simplificar } from './simplificar'
import { validarXml } from './validarXml'
import { MODELO_POOLS_CARRILES, MODELO_SIMPLE, MODELO_SUBPROCESO } from './fixtures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/**
 * Un diagrama "de producción": extensiones bizagi (atributo y extensionElements),
 * una flecha con ruta manual de la app, una anotación con asociación, y dos
 * carriles. Las extensiones bizagi aparecen en 15 diagramas de producción
 * (consulta del 2026-10-08).
 */
const XML_REAL = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:flujo="http://flujo.app/schema/bpmn" xmlns:bizagi="http://www.bizagi.com/bpmn20" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Pool_1" name="Compras" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_A" name="Solicitante"><bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef><bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_B" name="Compras"><bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef><bpmn:flowNodeRef>End_1</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_1" name="Necesidad"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Task_1" name="Pedir compra" bizagi:origen="bpm-import">
      <bpmn:extensionElements>
        <bizagi:BizagiExtensions><bizagi:BizagiProperties><bizagi:BizagiProperty name="bgColor" value="#ECEFFF" /></bizagi:BizagiProperties></bizagi:BizagiExtensions>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_2" name="Aprobar"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End_1" name="Comprado"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" flujo:manualRoute="true" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="End_1" />
    <bpmn:textAnnotation id="Note_1"><bpmn:text>Solo compras &gt; 1000</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_1" sourceRef="Task_2" targetRef="Note_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Pool_1_di" bpmnElement="Pool_1" isHorizontal="true"><dc:Bounds x="100" y="50" width="700" height="300" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A_di" bpmnElement="Lane_A" isHorizontal="true"><dc:Bounds x="130" y="50" width="670" height="150" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_B_di" bpmnElement="Lane_B" isHorizontal="true"><dc:Bounds x="130" y="200" width="670" height="150" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="182" y="107" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="270" y="95" width="90" height="60" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2"><dc:Bounds x="420" y="245" width="90" height="60" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="582" y="257" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Note_1_di" bpmnElement="Note_1"><dc:Bounds x="560" y="80" width="140" height="40" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="218" y="125" /><di:waypoint x="270" y="125" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="315" y="155" /><di:waypoint x="315" y="230" /><di:waypoint x="465" y="230" /><di:waypoint x="465" y="245" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="510" y="275" /><di:waypoint x="582" y="275" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Assoc_1_di" bpmnElement="Assoc_1"><di:waypoint x="465" y="245" /><di:waypoint x="465" y="100" /><di:waypoint x="560" y="100" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

let container: HTMLDivElement
let modeler: Any
beforeEach(() => {
  installJsdomSvgShims()
  container = document.createElement('div')
  document.body.appendChild(container)
  modeler = new Modeler({ container, additionalModules: [BizagiLayouter], moddleExtensions: { flujo: flujoModdle } })
})
afterEach(() => { modeler?.destroy(); container.remove() })

const bounds = (xml: string, id: string) => {
  const m = new RegExp(`id="${id}_di"[^>]*>\\s*<dc:Bounds x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.-]+)" height="([\\d.-]+)"`).exec(xml)
  return m ? m.slice(1).map(Number) : null
}

async function abreLimpio(xml: string) {
  const { warnings } = await modeler.importXML(xml)
  expect(warnings).toEqual([])
}

describe('editarXml — ida y vuelta sobre un diagrama real', () => {
  it('sin operaciones de contenido, lo no tocado queda igual: ids, coordenadas, bizagi, ruta manual', async () => {
    const { xml } = await editarXml(XML_REAL, [{ op: 'renombrar', id: 'Task_2', nombre: 'Aprobar compra' }])
    await abreLimpio(xml)
    expect(xml).toContain('name="Aprobar compra"')
    // Extensiones bizagi: atributo y extensionElements.
    expect(xml).toContain('xmlns:bizagi="http://www.bizagi.com/bpmn20"')
    expect(xml).toContain('bizagi:origen="bpm-import"')
    expect(xml).toMatch(/<bizagi:BizagiProperty name="bgColor" value="#ECEFFF"\s*\/>/)
    // Ruta manual y sus waypoints.
    expect(xml).toContain('flujo:manualRoute="true"')
    expect(xml).toMatch(/<di:waypoint x="315" y="230"\s*\/>/)
    // Coordenadas e ids de todo lo demás.
    for (const id of ['Pool_1', 'Lane_A', 'Lane_B', 'Start_1', 'Task_1', 'Task_2', 'End_1', 'Note_1']) {
      expect(bounds(xml, id), id).toEqual(bounds(XML_REAL, id))
    }
    expect(xml).toContain('Solo compras &gt; 1000')
  })

  it('agregar después de un nodo, conectar y renombrar en una sola llamada', async () => {
    const { xml, cambios } = await editarXml(XML_REAL, [
      { op: 'agregar_nodo', id: 'Notificar', tipo: 'tarea_envio', nombre: 'Notificar al solicitante', despues_de: 'Task_2' },
      { op: 'eliminar', id: 'Flow_3' },
      { op: 'conectar', desde: 'Task_2', hasta: 'Notificar' },
      { op: 'conectar', desde: 'Notificar', hasta: 'End_1', nombre: 'listo' },
    ])
    expect(cambios).toHaveLength(4)
    await abreLimpio(xml)
    const reg = modeler.get('elementRegistry')
    const nuevo = reg.get('Notificar')
    expect(nuevo.businessObject.$type).toBe('bpmn:SendTask')
    // Dentro de su carril (el de Task_2) y sin pisar a nadie.
    const lane = reg.get('Lane_B')
    expect(nuevo.y).toBeGreaterThanOrEqual(lane.y)
    expect(nuevo.y + nuevo.height).toBeLessThanOrEqual(lane.y + lane.height)
    for (const otro of ['Task_2', 'End_1', 'Note_1']) {
      const o = reg.get(otro)
      const solapa = nuevo.x < o.x + o.width && o.x < nuevo.x + nuevo.width && nuevo.y < o.y + o.height && o.y < nuevo.y + nuevo.height
      expect(solapa, otro).toBe(false)
    }
    // El flujo viejo ya no está y los nuevos sí.
    expect(reg.get('Flow_3')).toBeUndefined()
    // `outgoing` de diagram-js incluye también la asociación a la anotación.
    const flujos = reg.get('Task_2').outgoing.filter((c: Any) => c.type === 'bpmn:SequenceFlow')
    expect(flujos.map((c: Any) => c.target.id)).toEqual(['Notificar'])
    // La ruta manual de Flow_2 no se ha tocado.
    expect(xml).toMatch(/<di:waypoint x="315" y="230"\s*\/>/)
  })

  it('si no cabe, el carril y el pool crecen y lo de debajo baja', async () => {
    const ops = Array.from({ length: 6 }, (_, i) => ({
      op: 'agregar_nodo' as const, id: `extra${i}`, tipo: 'tarea' as const, carril: 'Lane_A',
    }))
    const { xml } = await editarXml(XML_REAL, ops)
    await abreLimpio(xml)
    const reg = modeler.get('elementRegistry')
    const pool = reg.get('Pool_1')
    const laneA = reg.get('Lane_A')
    const laneB = reg.get('Lane_B')
    expect(laneB.y).toBe(laneA.y + laneA.height) // contiguos
    for (let i = 0; i < 6; i++) {
      const e = reg.get(`extra${i}`)
      expect(e.x + e.width).toBeLessThanOrEqual(pool.x + pool.width)
      expect(e.y + e.height).toBeLessThanOrEqual(laneA.y + laneA.height)
    }
  })

  it('eliminar una tarea arrastra sus flujos y su asociación', async () => {
    const { xml, cambios } = await editarXml(XML_REAL, [{ op: 'eliminar', id: 'Task_2' }])
    await abreLimpio(xml)
    expect(cambios[0]).toMatch(/dependiente/)
    for (const id of ['Task_2', 'Flow_2', 'Flow_3', 'Assoc_1']) expect(xml).not.toContain(`"${id}"`)
    expect(xml).toContain('id="Note_1"')
  })

  it('evento de borde nuevo montado sobre su actividad', async () => {
    const { xml } = await editarXml(XML_REAL, [
      { op: 'agregar_nodo', id: 'Vence', tipo: 'evento_borde', evento: 'temporizador', adjunto_a: 'Task_2' },
    ])
    await abreLimpio(xml)
    const reg = modeler.get('elementRegistry')
    expect(reg.get('Vence').host.id).toBe('Task_2')
  })

  it('mensaje entre pools y flujo dentro del mismo pool', async () => {
    const { xml } = await construirXml(MODELO_POOLS_CARRILES)
    const r = await editarXml(xml, [
      { op: 'agregar_nodo', id: 'reclamar', tipo: 'tarea_envio', nombre: 'Reclamar', despues_de: 'esperar' },
      { op: 'conectar', desde: 'reclamar', hasta: 'confirmar' },
    ])
    await abreLimpio(r.xml)
    expect(r.cambios[1]).toMatch(/mensaje/)
  })

  it('todo o nada: si una operación falla no se devuelve XML', async () => {
    await expect(editarXml(XML_REAL, [
      { op: 'renombrar', id: 'Task_1', nombre: 'otro' },
      { op: 'conectar', desde: 'Task_1', hasta: 'NoExiste' },
    ])).rejects.toThrow(/operación 2/)
  })

  it.each([
    ['id repetido', { op: 'agregar_nodo', id: 'Task_1', tipo: 'tarea', carril: 'Lane_A' }, /ya existe/],
    ['carril que falta', { op: 'agregar_nodo', id: 'n', tipo: 'tarea' }, /carril/],
    ['borrar un pool', { op: 'eliminar', id: 'Pool_1' }, /no pools ni carriles/],
    ['flujo duplicado', { op: 'conectar', desde: 'Start_1', hasta: 'Task_1' }, /ya existe/],
    ['operación desconocida', { op: 'borrar_todo' }, /desconocida/],
  ])('rechaza: %s', async (_n, op, patron) => {
    await expect(editarXml(XML_REAL, [op as Any])).rejects.toThrow(patron)
  })

  it('no toca un XML con partes que no entiende', async () => {
    const raro = XML_REAL.replace('<bpmn:task id="Task_2"', '<bizagi:Cosa id="Rara" /><bpmn:task id="Task_2"')
    await expect(editarXml(raro, [{ op: 'renombrar', id: 'Task_1', nombre: 'x' }])).rejects.toBeInstanceOf(ErrorEdicion)
  })

  it('agregar dentro de un subproceso expandido', async () => {
    const { xml } = await construirXml(MODELO_SUBPROCESO)
    const r = await editarXml(xml, [{ op: 'agregar_nodo', id: 'nit', tipo: 'tarea', nombre: 'Revisar NIT', despues_de: 'banco' }])
    await abreLimpio(r.xml)
    const reg = modeler.get('elementRegistry')
    const sub = reg.get('verificar')
    const nit = reg.get('nit')
    expect(nit.parent.id).toBe('verificar')
    expect(nit.x + nit.width).toBeLessThanOrEqual(sub.x + sub.width)
  })
})

describe('simplificar', () => {
  it('devuelve la estructura de un diagrama generado, con la forma de la entrada', async () => {
    const { xml } = await construirXml(MODELO_POOLS_CARRILES)
    const s = await simplificar(xml)
    expect(s.pools.map((p) => p.id)).toEqual(['Empresa', 'Cliente'])
    expect(s.pools[0].carriles.map((c) => c.id)).toEqual(['Comercial', 'Operaciones'])
    const plazo = s.pools[0].nodos.find((n) => n.id === 'plazo')!
    expect(plazo).toMatchObject({ tipo: 'evento_borde', evento: 'temporizador', adjunto_a: 'preparar', carril: 'Operaciones' })
    expect(s.mensajes).toHaveLength(2)
    expect(s.flujos).toHaveLength(MODELO_POOLS_CARRILES.flujos!.length)
    expect(s.avisos_lectura).toEqual([])
  })

  it('lo que no tiene tipo semántico va a "otros", no se pierde', async () => {
    const s = await simplificar(XML_REAL)
    expect(s.otros.map((o) => o.tipo_bpmn)).toEqual(expect.arrayContaining(['bpmn:TextAnnotation', 'bpmn:Association']))
    expect(s.pools[0].nodos.map((n) => n.carril)).toEqual(['Lane_A', 'Lane_A', 'Lane_B', 'Lane_B'])
  })

  it('el resultado de simplificar se puede volver a generar', async () => {
    const { xml } = await construirXml(MODELO_SUBPROCESO)
    const s = await simplificar(xml)
    const otra = await construirXml({ pools: s.pools.map(({ sin_pool: _s, ...p }) => p), flujos: s.flujos, mensajes: s.mensajes })
    await abreLimpio(otra.xml)
  })
})

describe('validarXml', () => {
  it('usa la misma validación que la app y avisa de pools sin inicio ni fin', async () => {
    const { xml } = await construirXml({ pools: [{ id: 'P', nombre: 'P', nodos: [{ id: 'a', tipo: 'tarea', nombre: 'Suelta' }] }] })
    const r = await validarXml(xml)
    expect(r.resultados.map((x) => x.code).sort()).toEqual(['DISCONNECTED_ELEMENT', 'MISSING_END_EVENT', 'MISSING_START_EVENT'])
    expect(r.resultados[0].message).toMatch(/^El proceso|^Elemento/)
  })

  it('un proceso completo no da avisos', async () => {
    const r = await validarXml((await construirXml(MODELO_SIMPLE)).xml)
    expect(r.resultados).toEqual([])
  })
})
