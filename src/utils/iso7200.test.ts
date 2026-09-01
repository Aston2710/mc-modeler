import { describe, it, expect } from 'vitest'
import {
  ISO7200_FIELDS, DOCUMENT_STATUS, fieldSpec, mandatoryFields, sheetNumber, autoValue,
} from './iso7200'
import { DOCUMENT_META_FIELDS } from '@/bpmn/elements/documentMeta'

describe('el catálogo y el modelo no pueden divergir', () => {
  /**
   * Si un campo del catálogo no existe en `DocumentMeta`, la interfaz ofrece
   * rellenar algo que **no se guarda en ninguna parte** y el dato se pierde al
   * cerrar. No falla en tiempo de ejecución: simplemente desaparece.
   */
  it('todo campo del catálogo existe en DocumentMeta', () => {
    const conocidos = new Set<string>(DOCUMENT_META_FIELDS)
    for (const f of ISO7200_FIELDS) expect(conocidos.has(f.id)).toBe(true)
  })

  it('todo campo de DocumentMeta está en el catálogo', () => {
    // Al revés: un campo sin entrada en el catálogo no tiene control asignado y
    // la plantilla no puede encenderlo — código muerto que parece una función.
    const enCatalogo = new Set(ISO7200_FIELDS.map((f) => f.id))
    for (const f of DOCUMENT_META_FIELDS) expect(enCatalogo.has(f)).toBe(true)
  })

  it('no hay campos repetidos', () => {
    const ids = ISO7200_FIELDS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('la procedencia normativa se declara y se respeta', () => {
  it('los tres obligatorios de ISO 7200 que guardamos son código, título y fecha', () => {
    // El propietario legal vive en la plantilla del proyecto y el nº de hoja se
    // calcula, así que ninguno de los dos es un campo del diagrama.
    expect(mandatoryFields().map((f) => f.id)).toEqual(['code', 'title', 'date'])
  })

  it('todo campo obligatorio es de la norma: no inventamos obligaciones', () => {
    for (const f of ISO7200_FIELDS) if (f.mandatory) expect(f.iso).toBe(true)
  })

  it('los campos que no son de ISO 7200 están marcados como tales', () => {
    const fuera = ISO7200_FIELDS.filter((f) => !f.iso).map((f) => f.id)
    expect(fuera).toEqual(['revision', 'type', 'classification', 'distribution'])
  })
})

describe('la regla que gobierna los controles', () => {
  /**
   * *Si la norma fija los valores, son esos; si no, se escribe.* Una lista
   * cerrada que la norma no respalda sería nuestro invento, y convertiría la
   * herramienta en el formato de una empresa concreta.
   */
  it('solo hay lista cerrada donde la norma la fija', () => {
    const conLista = ISO7200_FIELDS.filter((f) => f.control === 'choice')
    expect(conLista.map((f) => f.id)).toEqual(['status'])
    expect(conLista[0].choices).toEqual(DOCUMENT_STATUS)
    expect(conLista[0].iso).toBe(true)
  })

  it('el estado del documento son los cuatro términos de la norma', () => {
    expect(DOCUMENT_STATUS).toEqual(['inPreparation', 'underApproval', 'released', 'withdrawn'])
  })

  it('el código se escribe: ISO 7200 no define su composición', () => {
    expect(fieldSpec('code')?.control).toBe('text')
    expect(fieldSpec('code')?.choices).toBeUndefined()
  })

  it('cada control declarado es uno de los que la interfaz sabe dibujar', () => {
    const validos = new Set(['text', 'date', 'choice', 'person', 'counter'])
    for (const f of ISO7200_FIELDS) expect(validos.has(f.control)).toBe(true)
  })

  it('un campo con lista cerrada trae la lista, y uno sin ella no', () => {
    for (const f of ISO7200_FIELDS) {
      if (f.control === 'choice') expect(f.choices?.length).toBeGreaterThan(0)
      else expect(f.choices).toBeUndefined()
    }
  })

  /** Sin longitud verificada no se cablea ninguna: ver la cabecera del módulo. */
  it('no hay longitudes máximas inventadas', () => {
    for (const f of ISO7200_FIELDS) expect(f.maxLength).toBeUndefined()
  })
})

describe('automáticos', () => {
  it('el título sale del nombre del diagrama', () => {
    expect(autoValue(fieldSpec('title')!, { diagramName: '  Facturación  ' })).toBe('Facturación')
  })

  it('la fecha sale de la última modificación, en ISO 8601', () => {
    const d = new Date('2026-08-23T15:04:05Z')
    expect(autoValue(fieldSpec('date')!, { lastModified: d })).toBe('2026-08-23')
  })

  it('una fecha inválida no produce basura', () => {
    expect(autoValue(fieldSpec('date')!, { lastModified: new Date('nada') })).toBe('')
    expect(autoValue(fieldSpec('date')!, { lastModified: null })).toBe('')
  })

  it('sin automático declarado no se inventa un valor', () => {
    // Un valor puesto por la herramienta que nadie revisó es peor que un hueco,
    // porque el hueco se ve.
    expect(autoValue(fieldSpec('code')!, { diagramName: 'X', lastModified: new Date() })).toBe('')
  })
})

describe('nº de hoja', () => {
  it('un diagrama es una página', () => {
    // El mosaico se midió y se descartó (D-E). Si deja de ser cierto, esta
    // prueba es lo que recuerda que hay más de un sitio que tocar.
    expect(sheetNumber()).toBe('1 / 1')
  })
})
