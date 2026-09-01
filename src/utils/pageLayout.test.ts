/**
 * PLAN-034 — la aritmética de la hoja.
 *
 * Estas pruebas fijan los números que se midieron sobre los 177 diagramas de
 * producción. Si cambian, la Vista Documento y la exportación empiezan a decir
 * cosas distintas, que es exactamente lo que este módulo existe para evitar.
 */
import { describe, it, expect } from 'vitest'
import {
  PAGE_SIZES,
  DEFAULT_PAGE_SPEC,
  LABEL_FONT_UNITS,
  MM_PER_POINT,
  pageDimensions,
  drawingArea,
  fitScale,
  labelPointSize,
  legibility,
  aspectComparison,
  placement,
  type PageSpec,
} from './pageLayout'

const spec = (o: Partial<PageSpec> = {}): PageSpec => ({ ...DEFAULT_PAGE_SPEC, ...o })

describe('tamaños de hoja', () => {
  it('Carta es 215.9 × 279.4, que es lo que usa el estándar del destino', () => {
    expect(PAGE_SIZES.carta.short).toBe(215.9)
    expect(PAGE_SIZES.carta.long).toBe(279.4)
  })

  it('la orientación intercambia los lados', () => {
    expect(pageDimensions(spec({ orientation: 'portrait' }))).toEqual({ width: 215.9, height: 279.4 })
    expect(pageDimensions(spec({ orientation: 'landscape' }))).toEqual({ width: 279.4, height: 215.9 })
  })

  it('por defecto es Carta apaisada con márgenes reducidos', () => {
    // No es una preferencia estética: es la configuración que más diagramas
    // deja legibles según la medición (49 % frente al 25 % de Carta vertical).
    expect(DEFAULT_PAGE_SPEC.size).toBe('carta')
    expect(DEFAULT_PAGE_SPEC.orientation).toBe('landscape')
    expect(DEFAULT_PAGE_SPEC.margin).toBe(12.7)
  })
})

describe('zona de dibujo', () => {
  it('descuenta márgenes y cabecera', () => {
    const a = drawingArea(spec({ orientation: 'portrait', margin: 25.4, headerHeight: 22 }))
    expect(a.width).toBeCloseTo(165.1, 1)
    expect(a.height).toBeCloseTo(206.6, 1)
  })

  it('girar el diagrama intercambia los ejes de la zona, no la hoja', () => {
    const base = spec({ orientation: 'portrait', margin: 25.4, headerHeight: 22 })
    const girado = drawingArea({ ...base, rotateDiagram: true })
    const recto = drawingArea(base)
    expect(girado.width).toBeCloseTo(recto.height, 5)
    expect(girado.height).toBeCloseTo(recto.width, 5)
    // La hoja sigue siendo vertical: el documento no cambia de orientación.
    expect(pageDimensions({ ...base, rotateDiagram: true })).toEqual({ width: 215.9, height: 279.4 })
  })

  it('nunca devuelve una zona negativa aunque el margen se pase', () => {
    const a = drawingArea(spec({ margin: 500, headerHeight: 500 }))
    expect(a.width).toBeGreaterThan(0)
    expect(a.height).toBeGreaterThan(0)
  })
})

describe('encaje y legibilidad', () => {
  it('manda el eje que primero toca el borde', () => {
    const s = spec({ orientation: 'portrait', margin: 25.4, headerHeight: 22 }) // 165.1 × 206.6
    // Diagrama muy ancho: limita el ancho.
    expect(fitScale(s, 1651, 100)).toBeCloseTo(0.1, 5)
    // Diagrama muy alto: limita el alto.
    expect(fitScale(s, 100, 2066)).toBeCloseTo(0.1, 5)
  })

  it('reproduce la medición: el diagrama mediano en su estándar sale a ~3.9 pt', () => {
    // Mediana real medida: 1428 × 510 unidades, en Carta vertical con márgenes
    // de 25.4 y 22 mm de cabecera. Es el número que motivó todo el plan.
    const s = spec({ orientation: 'portrait', margin: 25.4, headerHeight: 22 })
    const pt = labelPointSize(fitScale(s, 1428, 510))
    expect(pt).toBeGreaterThan(3.5)
    expect(pt).toBeLessThan(4.3)
    expect(legibility(pt)).toBe('ilegible')
  })

  it('ese mismo diagrama mejora en apaisada con márgenes reducidos', () => {
    const s = spec({ orientation: 'landscape', margin: 12.7, headerHeight: 22 })
    const pt = labelPointSize(fitScale(s, 1428, 510))
    expect(pt).toBeGreaterThan(labelPointSize(fitScale(spec({ orientation: 'portrait', margin: 25.4, headerHeight: 22 }), 1428, 510)))
  })

  it('el peor diagrama real sigue siendo ilegible en papel, y hay que decirlo', () => {
    // 7400 × 895 unidades. Ninguna hoja lo arregla; el vector sí, ampliando.
    const s = spec({ orientation: 'landscape', margin: 12.7, headerHeight: 22 })
    expect(legibility(labelPointSize(fitScale(s, 7400, 895)))).toBe('ilegible')
  })

  it('un diagrama degenerado da escala 0 en vez de dividir por cero', () => {
    expect(fitScale(spec(), 0, 100)).toBe(0)
    expect(fitScale(spec(), 100, 0)).toBe(0)
    expect(Number.isFinite(labelPointSize(fitScale(spec(), 0, 0)))).toBe(true)
  })

  it('los umbrales de legibilidad son los cuatro esperados', () => {
    expect(legibility(9)).toBe('comoda')
    expect(legibility(8)).toBe('comoda')
    expect(legibility(7)).toBe('limite')
    expect(legibility(6)).toBe('limite')
    expect(legibility(5)).toBe('dificil')
    expect(legibility(4)).toBe('dificil')
    expect(legibility(3.9)).toBe('ilegible')
  })

  it('la conversión punto/mm es la estándar', () => {
    expect(MM_PER_POINT).toBeCloseTo(0.352778, 5)
    expect(LABEL_FONT_UNITS).toBe(12)
    // 12 unidades a escala 1 mm/unidad = 12 mm = 34 pt.
    expect(labelPointSize(1)).toBeCloseTo(34.02, 1)
  })
})

describe('comparación de proporciones', () => {
  it('dice la que necesita el diagrama y la que da la hoja', () => {
    const s = spec({ orientation: 'landscape', margin: 25.4, headerHeight: 22 })
    const c = aspectComparison(s, 2270, 690)
    expect(c.needed).toBeCloseTo(3.29, 2)
    expect(c.offered).toBeCloseTo(1.6, 1)
  })
})

describe('colocación en la hoja', () => {
  it('centra el dibujo en la banda que queda bajo la cabecera', () => {
    const s = spec({ orientation: 'landscape', margin: 12.7, headerHeight: 20 })
    const p = placement(s, 1000, 500)
    const page = pageDimensions(s)
    // Centrado horizontal.
    expect(p.x + p.width / 2).toBeCloseTo(page.width / 2, 5)
    // Nunca invade la cabecera ni los márgenes.
    expect(p.y).toBeGreaterThanOrEqual(s.margin + s.headerHeight - 0.001)
    expect(p.x).toBeGreaterThanOrEqual(s.margin - 0.001)
    expect(p.x + p.width).toBeLessThanOrEqual(page.width - s.margin + 0.001)
    expect(p.y + p.height).toBeLessThanOrEqual(page.height - s.margin + 0.001)
  })

  it('girado, lo que ocupa en la hoja son los ejes intercambiados', () => {
    const s = spec({ orientation: 'portrait', margin: 12.7, headerHeight: 20, rotateDiagram: true })
    const p = placement(s, 2000, 500)
    // El diagrama es ancho; girado ocupa más alto que ancho en la hoja.
    expect(p.height).toBeGreaterThan(p.width)
    expect(p.width).toBeCloseTo(500 * p.scale, 5)
    expect(p.height).toBeCloseTo(2000 * p.scale, 5)
  })

  it('llena la zona en al menos un eje: no desperdicia por redondeo', () => {
    const s = spec({ orientation: 'landscape', margin: 12.7, headerHeight: 20 })
    const area = drawingArea(s)
    for (const [w, h] of [[1000, 500], [300, 900], [5000, 400], [800, 800]]) {
      const p = placement(s, w, h)
      const llenaAncho = Math.abs(p.width - area.width) < 0.01
      const llenaAlto = Math.abs(p.height - area.height) < 0.01
      expect(llenaAncho || llenaAlto).toBe(true)
    }
  })
})
