/**
 * PLAN-034 — los datos de la cabecera, probados contra moddle de verdad.
 *
 * La prueba que importa es el **roundtrip**: escribir, serializar a XML,
 * volver a leer y comprobar que nada se perdió y que el BPMN sigue siendo
 * canónico. Es lo que garantiza que el `.bpmn` exportado a otra herramienta no
 * lleve basura y que la extensión no corrompa la fuente de verdad (DEC-001).
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore — bpmn-moddle 10 exporta con nombre y sin tipos
import { BpmnModdle } from 'bpmn-moddle'
import flujoModdle from '../moddle/flujo.json'
import {
  readDocumentMeta,
  writeDocumentMeta,
  ensureDocumentMeta,
  findDocumentMeta,
  hasDocumentMeta,
  toModdleProps,
  EMPTY_DOCUMENT_META,
  DOCUMENT_META_FIELDS,
} from './documentMeta'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Proc_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" />
    <bpmn:task id="Task_1" name="Tarea" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diag_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Proc_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any

/** El Process del XML de prueba, que es el elemento raíz del diagrama. */
function procesoDe(defs: AnyEl): AnyEl {
  return defs.rootElements.find((e: AnyEl) => e.$type === 'bpmn:Process')
}

async function cargar(): Promise<{ moddle: AnyEl; defs: AnyEl; proceso: AnyEl }> {
  const moddle = new BpmnModdle({ flujo: flujoModdle })
  const { rootElement } = await moddle.fromXML(XML)
  const defs = rootElement as AnyEl
  return { moddle, defs, proceso: procesoDe(defs) }
}

const LLENO = {
  title: 'Clasificación BDF de Artículos',
  code: 'CVP01-A1-T3-NO01',
  date: '25/02/2025',
  revision: '6',
  type: 'Norma',
  classification: 'Interna',
  distribution: 'Gerente de Compras, Gerente de Logística',
  author: 'Ambar Pulido / Eduardo Echeverría',
  approver: 'Ignacio Vieto',
  // Campos de ISO 7200 añadidos en la fase 5. El roundtrip cubre TODOS los del
  // catálogo, no una muestra: un campo que no viaja se descubre cuando alguien
  // pierde un dato, y para entonces ya es tarde.
  status: 'released',
}

describe('lectura', () => {
  it('un diagrama sin cabecera devuelve todos los campos vacíos, no undefined', async () => {
    const { proceso } = await cargar()
    expect(readDocumentMeta(proceso)).toEqual(EMPTY_DOCUMENT_META)
    expect(findDocumentMeta(proceso)).toBeNull()
    expect(hasDocumentMeta(readDocumentMeta(proceso))).toBe(false)
  })
})

describe('escritura', () => {
  it('crea el extensionElements si no estaba', async () => {
    const { moddle, proceso } = await cargar()
    expect(proceso.extensionElements).toBeUndefined()
    ensureDocumentMeta(moddle, proceso)
    expect(proceso.extensionElements.values).toHaveLength(1)
    expect(proceso.extensionElements.values[0].$type).toBe('flujo:DocumentMeta')
  })

  it('no duplica el elemento al llamar dos veces', async () => {
    const { moddle, proceso } = await cargar()
    const a = ensureDocumentMeta(moddle, proceso)
    const b = ensureDocumentMeta(moddle, proceso)
    expect(a).toBe(b)
    expect(proceso.extensionElements.values).toHaveLength(1)
  })

  it('conserva lo que ya hubiera en extensionElements', async () => {
    const { moddle, proceso } = await cargar()
    proceso.extensionElements = moddle.create('bpmn:ExtensionElements', {
      values: [moddle.create('flujo:DocumentMeta', {})],
    })
    // Un elemento ajeno no debe desaparecer.
    const ajeno = moddle.create('bpmn:ExtensionElements', {})
    proceso.extensionElements.values.push(ajeno)
    ensureDocumentMeta(moddle, proceso)
    expect(proceso.extensionElements.values).toContain(ajeno)
  })
})

describe('roundtrip por XML — es la prueba que importa', () => {
  it('escribir, serializar y volver a leer conserva TODOS los campos del catálogo', async () => {
    const { moddle, defs, proceso } = await cargar()
    writeDocumentMeta(moddle, proceso, LLENO)

    const { xml } = await moddle.toXML(defs)
    const moddle2 = new BpmnModdle({ flujo: flujoModdle })
    const { rootElement } = await moddle2.fromXML(xml)
    const proceso2 = procesoDe(rootElement as AnyEl)

    expect(readDocumentMeta(proceso2)).toEqual(LLENO)
  })

  it('DocumentMeta no rompe la raíz ni el proceso', async () => {
    // Lo que sí rompió el primer intento, con `extends: ["bpmn:Definitions"]`.
    // Ver `moddle/extensionCasing.test.ts` para la medición completa.
    const { moddle, defs, proceso } = await cargar()
    writeDocumentMeta(moddle, proceso, LLENO)
    const { xml } = await moddle.toXML(defs)

    expect(xml).toContain('<bpmn:definitions')
    expect(xml).toContain('<bpmn:process')
    expect(xml).toContain('<bpmn:startEvent')
    expect(xml).toContain('<bpmn:task')
    expect(xml).not.toContain('<bpmn:Definitions')
    expect(xml).not.toContain('<bpmn:Process')
  })

  it('el sequenceFlow SIGUE saliendo roto — defecto preexistente, no de aquí', async () => {
    // `flujo.json` declara `ManualRoute extends ["bpmn:SequenceFlow"]` desde
    // antes de PLAN-034, y eso serializa `<bpmn:SequenceFlow>`. Medido en
    // producción el 2026-08-23: 139 de 177 diagramas lo llevan así.
    //
    // Se afirma la rotura en vez de ignorarla: el día que se corrija, esta
    // prueba fallará y recordará que hay que actualizar el incidente.
    const { moddle, defs, proceso } = await cargar()
    writeDocumentMeta(moddle, proceso, LLENO)
    const { xml } = await moddle.toXML(defs)

    expect(xml).toContain('<bpmn:SequenceFlow')
    expect(xml).not.toContain('<bpmn:sequenceFlow')
  })

  it('los datos van dentro de extensionElements, no sueltos en la raíz', async () => {
    const { moddle, defs, proceso } = await cargar()
    writeDocumentMeta(moddle, proceso, { code: 'ABC-01' })
    const { xml } = await moddle.toXML(defs)
    expect(xml).toContain('extensionElements')
    expect(xml).toContain('ABC-01')
    // La raíz no gana atributos.
    expect(/<bpmn:definitions[^>]*docCode/.test(xml)).toBe(false)
  })

  it('una cabecera vacía no ensucia el XML', async () => {
    // Sin datos, el fichero tiene que ser indistinguible del de antes.
    const { moddle, defs, proceso } = await cargar()
    writeDocumentMeta(moddle, proceso, { code: '', revision: '   ' })
    const { xml } = await moddle.toXML(defs)
    expect(xml).not.toContain('docCode')
    expect(xml).not.toContain('docRevision')
  })

  it('borrar un campo lo quita del XML', async () => {
    const { moddle, defs, proceso } = await cargar()
    writeDocumentMeta(moddle, proceso, { code: 'ABC-01' })
    writeDocumentMeta(moddle, proceso, { code: '' })
    const { xml } = await moddle.toXML(defs)
    expect(xml).not.toContain('ABC-01')
  })

  it('sobrevive a caracteres que hay que escapar', async () => {
    const { moddle, defs, proceso } = await cargar()
    const raro = 'A & B <C> "D" \'E\' ñÁ'
    writeDocumentMeta(moddle, proceso, { distribution: raro })
    const { xml } = await moddle.toXML(defs)
    const moddle2 = new BpmnModdle({ flujo: flujoModdle })
    const { rootElement } = await moddle2.fromXML(xml)
    const p2 = procesoDe(rootElement as AnyEl)
    expect(readDocumentMeta(p2).distribution).toBe(raro)
  })
})

describe('toModdleProps', () => {
  it('solo incluye lo que se pasa, para no borrar lo demás sin querer', () => {
    expect(toModdleProps({ code: 'X' })).toEqual({ docCode: 'X' })
  })

  it('los vacíos van como undefined para que el atributo no se serialice', () => {
    expect(toModdleProps({ code: '', revision: '  ' })).toEqual({
      docCode: undefined,
      docRevision: undefined,
    })
  })

  it('cubre todos los campos del catálogo', () => {
    const props = toModdleProps(LLENO)
    expect(Object.keys(props)).toHaveLength(DOCUMENT_META_FIELDS.length)
  })
})
