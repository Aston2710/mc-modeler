// @vitest-environment jsdom
/**
 * La plantilla del diagrama suelto, guardada en el navegador.
 *
 * Lo que de verdad importa aquí es la **frontera**: `localStorage` es texto que
 * puede haber escrito cualquiera, y el logo va por valor, así que hay dos cosas
 * que no pueden colarse — basura y un logo sin límite.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadLocalDocumentHeader,
  saveLocalDocumentHeader,
  MAX_LOCAL_LOGO_CHARS,
} from './localDocumentHeader'
import { DEFAULT_STORED_DOCUMENT_HEADER, parseStoredDocumentHeader } from './documentHeader'

const KEY = 'mc-modeler.docheader.v1'
const PNG = 'data:image/png;base64,AAAA'

beforeEach(() => localStorage.clear())

describe('loadLocalDocumentHeader', () => {
  it('sin nada guardado devuelve la plantilla neutra', () => {
    expect(loadLocalDocumentHeader()).toEqual({
      ...DEFAULT_STORED_DOCUMENT_HEADER,
      logoImageId: null,
      logoDataUrl: null,
    })
  })

  it('devuelve lo guardado, logo incluido', () => {
    saveLocalDocumentHeader({
      ...DEFAULT_STORED_DOCUMENT_HEADER,
      enabled: true,
      fields: ['code'],
      logoDataUrl: PNG,
    })
    const r = loadLocalDocumentHeader()
    expect(r.enabled).toBe(true)
    expect(r.fields).toEqual(['code'])
    expect(r.logoDataUrl).toBe(PNG)
  })

  it('un JSON corrupto no impide trabajar', () => {
    localStorage.setItem(KEY, '{no es json')
    expect(loadLocalDocumentHeader().enabled).toBe(false)
  })

  /**
   * El resto de la plantilla pasa por el MISMO parseo que lo que viene de la
   * base de datos: una sola definición de qué es una plantilla válida.
   */
  it('valida el resto con el parseo de siempre', () => {
    localStorage.setItem(KEY, JSON.stringify({ enabled: 'sí', height: -5, fontSize: 0, columns: [1, 2] }))
    const r = loadLocalDocumentHeader()
    expect(r.enabled).toBe(false)
    expect(r.height).toBeGreaterThan(0)
    expect(r.fontSize).toBeGreaterThan(0)
    expect(r.columns).toHaveLength(3)
  })
})

describe('el logo, que es lo que no puede colarse', () => {
  it('descarta lo que no es un data URL de imagen', () => {
    for (const basura of [42, null, 'https://ejemplo/logo.png', 'data:text/html,<script>', '']) {
      localStorage.setItem(KEY, JSON.stringify({ logoDataUrl: basura }))
      expect(loadLocalDocumentHeader().logoDataUrl).toBeNull()
    }
  })

  /**
   * `localStorage` es una cuota compartida con las preferencias de exportación.
   * Un logo sin tope no solo no cabe: al reventar la cuota se lleva por delante
   * lo que ya había guardado.
   */
  it('descarta un logo por encima del tope', () => {
    const enorme = 'data:image/png;base64,' + 'A'.repeat(MAX_LOCAL_LOGO_CHARS)
    localStorage.setItem(KEY, JSON.stringify({ logoDataUrl: enorme }))
    expect(loadLocalDocumentHeader().logoDataUrl).toBeNull()
  })

  /**
   * ESTA ES LA GARANTÍA DE QUE LOS DOS CAMINOS NO SE CRUZAN. Sin proyecto el
   * logo va por valor; con proyecto, por referencia a la biblioteca. Guardar la
   * referencia aquí dejaría un id colgando que nadie puede resolver.
   */
  it('no guarda la referencia a la biblioteca', () => {
    saveLocalDocumentHeader({ ...DEFAULT_STORED_DOCUMENT_HEADER, logoImageId: 'img-1', logoDataUrl: PNG })
    expect(JSON.parse(localStorage.getItem(KEY)!)).not.toHaveProperty('logoImageId')
    expect(loadLocalDocumentHeader().logoImageId).toBeNull()
  })

  /**
   * La otra mitad de la misma garantía, y la que protege a producción:
   * `parseStoredDocumentHeader` es el único camino por el que entra una
   * plantilla desde Postgres o IndexedDB, y descarta los bytes siempre. Sin
   * esto, un base64 podría acabar en `projects.doc_template`.
   */
  it('el parseo de la base de datos nunca acepta bytes de logo', () => {
    const p = parseStoredDocumentHeader({ logoImageId: 'img-1', logoDataUrl: PNG })
    expect(p.logoImageId).toBe('img-1')
    expect(p.logoDataUrl).toBeUndefined()
  })
})

describe('saveLocalDocumentHeader', () => {
  it('dice que sí cuando escribe', () => {
    expect(saveLocalDocumentHeader(DEFAULT_STORED_DOCUMENT_HEADER)).toBe(true)
  })

  /**
   * Devuelve `false` en vez de tragárselo: esto no es recordar el último tamaño
   * de hoja, es una configuración que la persona acaba de componer, y perderla
   * en silencio sería mentirle.
   */
  it('dice que no si el navegador no deja escribir', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveLocalDocumentHeader(DEFAULT_STORED_DOCUMENT_HEADER)).toBe(false)
    spy.mockRestore()
  })
})
