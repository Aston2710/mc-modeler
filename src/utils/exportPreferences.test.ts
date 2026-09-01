// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadExportPreferences, saveExportPreferences } from './exportPreferences'

const KEY = 'mc-modeler.export.v1'

describe('exportPreferences', () => {
  beforeEach(() => localStorage.clear())

  it('sin nada guardado no devuelve nada, y no revienta', () => {
    expect(loadExportPreferences()).toEqual({})
  })

  it('recuerda lo elegido y lo devuelve tal cual', () => {
    saveExportPreferences({ size: 'a3', orientation: 'portrait', margin: 6, theme: 'light' })
    expect(loadExportPreferences()).toEqual({
      size: 'a3', orientation: 'portrait', margin: 6, theme: 'light',
    })
  })

  it('acumula: guardar una clave no borra las demás', () => {
    saveExportPreferences({ size: 'a4' })
    saveExportPreferences({ margin: 12.7 })
    expect(loadExportPreferences()).toEqual({ size: 'a4', margin: 12.7 })
  })

  /**
   * Lo que importa de verdad: `localStorage` es texto que puede haber escrito
   * cualquiera. Un margen inventado saldría a la aritmética de la hoja y la
   * previsualización mentiría, así que se descarta en silencio.
   */
  it('descarta valores que la interfaz nunca pudo ofrecer', () => {
    localStorage.setItem(KEY, JSON.stringify({
      size: 'tabloide', orientation: 'diagonal', margin: 3, theme: 'sepia', pngScale: 9,
      rotateDiagram: 'sí', includeHeader: 'sí', openSections: ['hoja', 7],
    }))
    expect(loadExportPreferences()).toEqual({ openSections: ['hoja'] })
  })

  /** La cabecera nace apagada: sin nada recordado no hay decisión que heredar. */
  it('no inventa una cabecera cuando no hay nada recordado', () => {
    expect(loadExportPreferences().includeHeader).toBeUndefined()
    saveExportPreferences({ includeHeader: true })
    expect(loadExportPreferences().includeHeader).toBe(true)
    saveExportPreferences({ includeHeader: false })
    expect(loadExportPreferences().includeHeader).toBe(false)
  })

  it('un JSON corrupto se ignora como si no hubiera nada', () => {
    localStorage.setItem(KEY, '{no soy json')
    expect(loadExportPreferences()).toEqual({})
  })

  it('un valor que no es objeto se ignora', () => {
    localStorage.setItem(KEY, '"carta"')
    expect(loadExportPreferences()).toEqual({})
  })
})
