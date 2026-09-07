/**
 * PLAN-034 — la cabecera.
 *
 * Se prueba la aritmética pura y, con un jsPDF de mentira que registra llamadas,
 * lo que de verdad importa del dibujo: que no invente contenido, que no se
 * salga de la hoja y que **no lleve nada de ninguna empresa por defecto**.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_DOCUMENT_HEADER,
  DEFAULT_STORED_DOCUMENT_HEADER,
  columnWidths,
  documentHeaderHeight,
  fitLogo,
  drawDocumentHeader,
  enableDocumentHeader,
  parseStoredDocumentHeader,
  resolveDocumentHeader,
  type DocumentHeaderTemplate,
} from './documentHeader'
import { EMPTY_DOCUMENT_META, type DocumentMeta } from '@/bpmn/elements/documentMeta'

const tpl = (o: Partial<DocumentHeaderTemplate> = {}): DocumentHeaderTemplate => ({
  ...DEFAULT_DOCUMENT_HEADER,
  enabled: true,
  ...o,
})
const meta = (o: Partial<DocumentMeta> = {}): DocumentMeta => ({ ...EMPTY_DOCUMENT_META, ...o })

/** jsPDF de mentira: registra lo dibujado para poder afirmar sobre ello. */
function fakePdf() {
  const llamadas: { op: string; args: unknown[] }[] = []
  const reg = (op: string) => (...args: unknown[]) => { llamadas.push({ op, args }) }
  const pdf = {
    setDrawColor: reg('setDrawColor'),
    setTextColor: reg('setTextColor'),
    setFillColor: reg('setFillColor'),
    setLineWidth: reg('setLineWidth'),
    setFont: reg('setFont'),
    setFontSize: reg('setFontSize'),
    rect: reg('rect'),
    line: reg('line'),
    text: reg('text'),
    addImage: reg('addImage'),
    getTextWidth: (s: string) => s.length * 1.5,
  }
  const textos = () => llamadas.filter((l) => l.op === 'text').map((l) => String(l.args[0]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pdf: pdf as any, llamadas, textos }
}

describe('la plantilla por defecto no lleva marca de nadie', () => {
  it('sale sin logo', () => {
    // Es la garantía de que la herramienta no se cablea a ninguna empresa.
    expect(DEFAULT_DOCUMENT_HEADER.logo).toBeNull()
  })

  it('sale apagada: un diagrama nuevo no tiene cabecera', () => {
    expect(DEFAULT_DOCUMENT_HEADER.enabled).toBe(false)
    expect(documentHeaderHeight(DEFAULT_DOCUMENT_HEADER)).toBe(0)
  })

  /**
   * EXP-023. La plantilla guardada trae `enabled: false` SIEMPRE —nadie lo
   * enciende desde que la casilla de exportar dejó de escribirlo en el
   * proyecto—, así que quien dibuja tiene que encenderla al vuelo. Sin esto la
   * cabecera se veía en la hoja del diálogo y no salía ni en el PDF ni en el
   * lienzo, que es como se fue a producción.
   */
  it('se puede encender para dibujarla sin tocar la guardada', () => {
    const guardada = DEFAULT_DOCUMENT_HEADER
    const dibujable = enableDocumentHeader(guardada, true)

    expect(dibujable.enabled).toBe(true)
    expect(documentHeaderHeight(dibujable)).toBeGreaterThan(0)
    // La original no se toca: es el objeto que comparte todo el que la lee.
    expect(guardada.enabled).toBe(false)
    expect(documentHeaderHeight(guardada)).toBe(0)
  })

  it('y se puede apagar igual de barato', () => {
    expect(documentHeaderHeight(enableDocumentHeader(tpl(), false))).toBe(0)
  })

  it('las etiquetas de reserva son genéricas de documento controlado', () => {
    // La aplicación las sustituye por las del catálogo traducido; estas solo se
    // ven en el laboratorio y en las pruebas.
    expect(DEFAULT_DOCUMENT_HEADER.rows.map((r) => r.label)).toEqual(['Código:', 'Fecha:', 'Revisión:'])
  })

  it('conserva las proporciones medidas del estándar real', () => {
    // 40.0 | 74.6 | 50.3 = 164.9 mm, el ancho útil de una Carta vertical con
    // márgenes de 25.4. Leído del XML de un .docx normativo.
    expect(DEFAULT_DOCUMENT_HEADER.columns).toEqual([40, 74.6, 50.3])
    const suma = DEFAULT_DOCUMENT_HEADER.columns.reduce((a, b) => a + b, 0)
    expect(suma).toBeCloseTo(164.9, 1)
  })
})

describe('parseStoredDocumentHeader — frontera defensiva contra el jsonb', () => {
  it('sin nada guardado devuelve la plantilla neutra', () => {
    for (const basura of [null, undefined, 0, '', 'texto', []]) {
      const p = parseStoredDocumentHeader(basura)
      expect(p.enabled).toBe(false)
      expect(p.logoImageId).toBeNull()
    }
  })

  it('una plantilla rota no puede impedir abrir el proyecto', () => {
    const p = parseStoredDocumentHeader({
      enabled: 'sí', height: -5, columns: [1, 2], rows: 'no es lista',
      fontSize: 0, logoImageId: 42, borderColor: 99,
    })
    expect(p.enabled).toBe(false)
    expect(p.height).toBeGreaterThan(0)
    expect(p.columns).toHaveLength(3)
    expect(Array.isArray(p.fields)).toBe(true)
    expect(p.fontSize).toBeGreaterThan(0)
    expect(p.logoImageId).toBeNull()
    expect(typeof p.borderColor).toBe('string')
  })

  it('conserva lo que sí es válido', () => {
    const p = parseStoredDocumentHeader({
      enabled: true, height: 22, columns: [1, 2, 3], logoImageId: 'img-1',
      fields: ['code'], fontSize: 9,
    })
    expect(p.enabled).toBe(true)
    expect(p.height).toBe(22)
    expect(p.columns).toEqual([1, 2, 3])
    expect(p.logoImageId).toBe('img-1')
    expect(p.fields).toEqual(['code'])
    expect(p.fontSize).toBe(9)
  })

  /**
   * La forma anterior guardaba `rows` con la etiqueta escrita dentro. Hubo
   * plantillas así en el laboratorio, y una plantilla vieja no puede dejar un
   * proyecto sin cabecera: se toma el campo y se descarta la etiqueta, que ahora
   * sale traducida del catálogo.
   */
  it('acepta la forma anterior con `rows`, quedándose con el campo', () => {
    const p = parseStoredDocumentHeader({ rows: [{ label: 'Huérfana' }, { field: 'date', label: 'F:' }] })
    expect(p.fields).toEqual(['date'])
  })

  it('`fields` gana sobre `rows` si vienen los dos', () => {
    const p = parseStoredDocumentHeader({ fields: ['code'], rows: [{ field: 'date', label: 'F:' }] })
    expect(p.fields).toEqual(['code'])
  })

  it('`enabled` solo es cierto si es exactamente true', () => {
    // Un jsonb con "true" o 1 no debe encender una cabecera sin querer.
    expect(parseStoredDocumentHeader({ enabled: 'true' }).enabled).toBe(false)
    expect(parseStoredDocumentHeader({ enabled: 1 }).enabled).toBe(false)
    expect(parseStoredDocumentHeader({ enabled: true }).enabled).toBe(true)
  })
})

describe('resolveDocumentHeader', () => {
  /** Etiquetadora de prueba: el modulo no traduce, recibe las etiquetas hechas. */
  const ETIQUETA = (f: string) => `[${f}]`

  const guardada = { ...DEFAULT_STORED_DOCUMENT_HEADER, enabled: true, logoImageId: 'img-1' }

  it('resuelve el logo desde la biblioteca', async () => {
    const r = await resolveDocumentHeader(guardada, async () => 'data:image/png;base64,AAA', ETIQUETA)
    expect(r.logo).toBe('data:image/png;base64,AAA')
    expect('logoImageId' in r).toBe(false)
  })

  it('sin referencia no pide nada', async () => {
    const cargar = vi.fn()
    const r = await resolveDocumentHeader({ ...guardada, logoImageId: null }, cargar, ETIQUETA)
    expect(cargar).not.toHaveBeenCalled()
    expect(r.logo).toBeNull()
  })

  it('si el logo falla, la cabecera se dibuja igual sin él', async () => {
    // Una imagen que falta no puede impedir exportar un documento.
    const r = await resolveDocumentHeader(guardada, async () => { throw new Error('404') }, ETIQUETA)
    expect(r.logo).toBeNull()
    expect(r.enabled).toBe(true)
  })

  /**
   * El logo se prepara antes de dibujarlo: se re-codifica a PNG —porque el
   * decodificador de WebP de jsPDF destroza el que guarda la biblioteca— y se
   * mide su proporción real. Ver `utils/logoImage.ts`.
   */
  it('prepara el logo y se queda con su proporción real', async () => {
    const r = await resolveDocumentHeader(
      guardada,
      async () => 'data:image/webp;base64,ORIGINAL',
      ETIQUETA,
      async () => ({ dataUrl: 'data:image/png;base64,LIMPIO', aspect: 1 })
    )
    expect(r.logo).toBe('data:image/png;base64,LIMPIO')
    expect(r.logoAspect).toBe(1)
  })

  it('si la preparación falla se conserva el original: mejor deformado que ausente', async () => {
    const r = await resolveDocumentHeader(
      guardada, async () => 'data:image/webp;base64,ORIGINAL', ETIQUETA, async () => null
    )
    expect(r.logo).toBe('data:image/webp;base64,ORIGINAL')
    expect(r.logoAspect).toBeUndefined()
  })

  it('sin preparador la plantilla se resuelve igual', async () => {
    const r = await resolveDocumentHeader(guardada, async () => 'data:image/png;base64,AAA', ETIQUETA)
    expect(r.logo).toBe('data:image/png;base64,AAA')
    expect(r.logoAspect).toBeUndefined()
  })
})

describe('columnWidths', () => {
  it('escala las tres columnas al ancho disponible conservando la proporción', () => {
    const [a, b, c] = columnWidths(tpl(), 164.9)
    expect(a).toBeCloseTo(40, 1)
    expect(b).toBeCloseTo(74.6, 1)
    expect(c).toBeCloseTo(50.3, 1)
  })

  it('la suma es exacta: nada de rendijas por redondeo', () => {
    for (const ancho of [100, 164.9, 254, 394.6, 33.3]) {
      const [a, b, c] = columnWidths(tpl(), ancho)
      expect(a + b + c).toBeCloseTo(ancho, 9)
    }
  })

  it('con ancho cero no devuelve NaN', () => {
    expect(columnWidths(tpl(), 0)).toEqual([0, 0, 0])
  })
})

describe('fitLogo', () => {
  const celda = { x: 10, y: 20, width: 40, height: 18 }

  it('encaja conservando la proporción y deja aire', () => {
    const r = fitLogo(celda, 20.4 / 12.1)
    expect(r.width).toBeLessThanOrEqual(celda.width - 4)
    expect(r.height).toBeLessThanOrEqual(celda.height - 4)
    expect(r.width / r.height).toBeCloseTo(20.4 / 12.1, 3)
  })

  it('lo centra en la celda', () => {
    const r = fitLogo(celda, 2)
    expect(r.x + r.width / 2).toBeCloseTo(celda.x + celda.width / 2, 6)
    expect(r.y + r.height / 2).toBeCloseTo(celda.y + celda.height / 2, 6)
  })

  it('un logo muy alto se limita por el alto, no por el ancho', () => {
    const r = fitLogo(celda, 0.2)
    expect(r.height).toBeCloseTo(celda.height - 4, 6)
  })

  it('con celda degenerada devuelve tamaño cero en vez de NaN', () => {
    expect(fitLogo({ x: 0, y: 0, width: 1, height: 1 }, 1).width).toBe(0)
    expect(fitLogo(celda, 0).width).toBe(0)
  })
})

describe('drawDocumentHeader', () => {
  it('apagado no dibuja absolutamente nada', () => {
    const { pdf, llamadas } = fakePdf()
    drawDocumentHeader(pdf, { tpl: tpl({ enabled: false }), meta: meta({ code: 'X' }), margin: 12.7, pageWidth: 279.4 })
    expect(llamadas).toHaveLength(0)
  })

  it('dibuja el marco y las dos divisiones de celda', () => {
    const { pdf, llamadas } = fakePdf()
    drawDocumentHeader(pdf, { tpl: tpl(), meta: meta({ code: 'X' }), margin: 12.7, pageWidth: 279.4 })
    expect(llamadas.filter((l) => l.op === 'rect')).toHaveLength(1)
    expect(llamadas.filter((l) => l.op === 'line')).toHaveLength(2)
  })

  it('el marco no se sale de los márgenes', () => {
    const { pdf, llamadas } = fakePdf()
    const margin = 12.7
    const pageWidth = 279.4
    drawDocumentHeader(pdf, { tpl: tpl(), meta: meta({ code: 'X' }), margin, pageWidth })
    const [x, , w] = llamadas.find((l) => l.op === 'rect')!.args as number[]
    expect(x).toBeCloseTo(margin, 6)
    expect(x + w).toBeCloseTo(pageWidth - margin, 6)
  })

  it('omite las filas cuyo campo está vacío — no imprime etiquetas huérfanas', () => {
    const { pdf, textos } = fakePdf()
    drawDocumentHeader(pdf, { tpl: tpl(), meta: meta({ code: 'ABC-01' }), margin: 12.7, pageWidth: 279.4 })
    const t = textos()
    expect(t).toContain('Código:')
    expect(t).toContain('ABC-01')
    expect(t).not.toContain('Fecha:')
    expect(t).not.toContain('Revisión:')
  })

  it('usa el nombre del diagrama como título si el campo está vacío', () => {
    const { pdf, textos } = fakePdf()
    drawDocumentHeader(pdf, {
      tpl: tpl(), meta: meta(), fallbackTitle: 'Proceso de Venta', margin: 12.7, pageWidth: 279.4,
    })
    expect(textos()).toContain('Proceso de Venta')
  })

  it('el campo del documento gana al nombre del diagrama', () => {
    const { pdf, textos } = fakePdf()
    drawDocumentHeader(pdf, {
      tpl: tpl(), meta: meta({ title: 'Clasificación BDF' }), fallbackTitle: 'Otro', margin: 12.7, pageWidth: 279.4,
    })
    expect(textos()).toContain('Clasificación BDF')
    expect(textos()).not.toContain('Otro')
  })

  it('sin logo no llama a addImage', () => {
    const { pdf, llamadas } = fakePdf()
    drawDocumentHeader(pdf, { tpl: tpl(), meta: meta({ code: 'X' }), margin: 12.7, pageWidth: 279.4 })
    expect(llamadas.filter((l) => l.op === 'addImage')).toHaveLength(0)
  })

  it('con logo lo dibuja dentro de la primera celda', () => {
    const { pdf, llamadas } = fakePdf()
    const margin = 12.7
    drawDocumentHeader(pdf, {
      tpl: tpl({ logo: 'data:image/png;base64,AAAA' }),
      meta: meta({ code: 'X' }), margin, pageWidth: 279.4,
    })
    const img = llamadas.find((l) => l.op === 'addImage')
    expect(img).toBeDefined()
    const [, , x, , w] = img!.args as [string, string, number, number, number]
    const [w0] = columnWidths(tpl(), 279.4 - margin * 2)
    expect(x).toBeGreaterThanOrEqual(margin)
    expect(x + w).toBeLessThanOrEqual(margin + w0 + 0.001)
  })

  /**
   * ESTA ES LA PRUEBA DE LA DEFORMACIÓN. El dibujado encajaba el logo con la
   * proporción del `.docx` que se midió para las columnas (20.4/12.1), pasara lo
   * que pasara: un logo cuadrado salía estirado a 1.69:1. Ahora usa la que trae
   * la plantilla, medida al preparar la imagen.
   */
  it('respeta la proporción real del logo en vez de la del estándar', () => {
    const { pdf, llamadas } = fakePdf()
    drawDocumentHeader(pdf, {
      tpl: tpl({ logo: 'data:image/png;base64,AAAA', logoAspect: 1 }),
      meta: meta({ code: 'X' }), margin: 12.7, pageWidth: 279.4,
    })
    const [, , , , w, h] = llamadas.find((l) => l.op === 'addImage')!.args as [string, string, number, number, number, number]
    expect(w / h).toBeCloseTo(1, 6)
  })

  it('sin proporción medida cae en la del estándar, no en NaN', () => {
    const { pdf, llamadas } = fakePdf()
    drawDocumentHeader(pdf, {
      tpl: tpl({ logo: 'data:image/png;base64,AAAA' }),
      meta: meta({ code: 'X' }), margin: 12.7, pageWidth: 279.4,
    })
    const [, , , , w, h] = llamadas.find((l) => l.op === 'addImage')!.args as [string, string, number, number, number, number]
    expect(w / h).toBeCloseTo(20.4 / 12.1, 3)
  })

  /**
   * `prepareLogo` deja siempre PNG. Anunciar otra cosa a jsPDF solo importa
   * cuando no reconoce la cabecera del binario, pero anunciarlo mal es
   * exactamente lo que llevaba el WebP al decodificador que lo rompía.
   */
  it('anuncia PNG a jsPDF', () => {
    const { pdf, llamadas } = fakePdf()
    drawDocumentHeader(pdf, {
      tpl: tpl({ logo: 'data:image/png;base64,AAAA', logoAspect: 2 }),
      meta: meta({ code: 'X' }), margin: 12.7, pageWidth: 279.4,
    })
    expect((llamadas.find((l) => l.op === 'addImage')!.args as unknown[])[1]).toBe('PNG')
  })

  it('un logo ilegible no tumba la exportación', () => {
    const { pdf } = fakePdf()
    pdf.addImage = vi.fn(() => { throw new Error('imagen corrupta') })
    expect(() =>
      drawDocumentHeader(pdf, {
        tpl: tpl({ logo: 'data:image/png;base64,ROTO' }),
        meta: meta({ code: 'X' }), margin: 12.7, pageWidth: 279.4,
      })
    ).not.toThrow()
  })

  it('una cabecera encendido pero sin datos dibuja el marco y ningún texto', () => {
    const { pdf, llamadas, textos } = fakePdf()
    drawDocumentHeader(pdf, { tpl: tpl(), meta: meta(), margin: 12.7, pageWidth: 279.4 })
    expect(llamadas.filter((l) => l.op === 'rect')).toHaveLength(1)
    expect(textos()).toHaveLength(0)
  })
})
