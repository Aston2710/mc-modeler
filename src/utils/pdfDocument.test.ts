// @vitest-environment jsdom
/**
 * PLAN-034 fase 1 — las partes puras de la composición de la hoja.
 *
 * `renderDiagramPdf` entero no se prueba aquí: `svg2pdf` mide el SVG con APIs
 * que jsdom no implementa (`getBBox`, estilos calculados de SVG). Esa parte se
 * verifica en un navegador de verdad con `scripts/verificar-pdf.mjs`, contra los
 * SVG reales de producción. Aquí se fija lo que sí es determinista y lo que más
 * fácil se rompe al refactorizar.
 */
import { describe, it, expect } from 'vitest'
import { svgViewBox, rotateSvgQuarterTurn } from './pdfDocument'

const svgTexto = (attrs: string, cuerpo = '<rect x="0" y="0" width="10" height="10"/>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${cuerpo}</svg>`

function montar(texto: string): SVGSVGElement {
  const host = document.createElement('div')
  host.innerHTML = texto
  return host.querySelector('svg') as SVGSVGElement
}

describe('svgViewBox', () => {
  it('prefiere el viewBox, que tras recortar es la medida real', () => {
    expect(svgViewBox(svgTexto('viewBox="10 20 300 200" width="999" height="999"'))).toEqual({
      x: 10, y: 20, width: 300, height: 200,
    })
  })

  it('cae a width/height si no hay viewBox', () => {
    expect(svgViewBox(svgTexto('width="800" height="600"'))).toEqual({
      x: 0, y: 0, width: 800, height: 600,
    })
  })

  it('admite viewBox con comas y con origen negativo', () => {
    expect(svgViewBox(svgTexto('viewBox="-50,-20,300,200"'))).toEqual({
      x: -50, y: -20, width: 300, height: 200,
    })
  })

  it('devuelve 0 en vez de NaN cuando no hay medidas', () => {
    expect(svgViewBox('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toEqual({
      x: 0, y: 0, width: 0, height: 0,
    })
  })
})

describe('rotateSvgQuarterTurn', () => {
  it('intercambia los ejes del viewBox', () => {
    const el = montar(svgTexto('viewBox="0 0 300 200"'))
    rotateSvgQuarterTurn(el)
    expect(el.getAttribute('viewBox')).toBe('0 0 200 300')
    expect(el.getAttribute('width')).toBe('200')
    expect(el.getAttribute('height')).toBe('300')
  })

  it('la transformación lleva la caja al primer cuadrante', () => {
    // rotar +90 manda (x,y) a (-y,x); para que [minX,minX+w]x[minY,minY+h] caiga
    // en [0,h]x[0,w] hay que trasladar con (minY+h, -minX).
    const el = montar(svgTexto('viewBox="10 20 300 200"'))
    rotateSvgQuarterTurn(el)
    const g = el.querySelector('g')!
    expect(g.getAttribute('transform')).toBe('translate(220, -10) rotate(90)')
  })

  /**
   * EL SENTIDO DEL GIRO, comprobado por sus consecuencias y no por su matriz.
   *
   * Con −90° un diagrama que se lee de izquierda a derecha salía de abajo hacia
   * arriba: había que empezar por el pie de la hoja. Esta prueba fija que al
   * avanzar en el eje X del diagrama se BAJA en la hoja girada.
   */
  it('gira en el sentido que hace que el flujo baje, no que suba', () => {
    const el = montar(svgTexto('viewBox="0 0 300 200"'))
    rotateSvgQuarterTurn(el)
    const t = el.querySelector('g')!.getAttribute('transform')!
    // Con +90 el eje X del diagrama se convierte en el eje Y de la hoja hacia
    // ABAJO. Volver a -90 lo pondría de abajo hacia arriba, que es el defecto.
    expect(t).toContain('rotate(90)')
    expect(t).not.toContain('rotate(-90)')
  })

  it('mete el contenido dibujable dentro del grupo', () => {
    const el = montar(svgTexto('viewBox="0 0 100 50"', '<rect id="a"/><circle id="b"/>'))
    rotateSvgQuarterTurn(el)
    const g = el.querySelector('g')!
    expect(g.querySelector('#a')).not.toBeNull()
    expect(g.querySelector('#b')).not.toBeNull()
  })

  it('deja fuera defs y style — los marcadores se referencian por URL', () => {
    // Meter <defs> o <style> en el grupo girado no aporta nada y puede alterar
    // el orden de resolución de las reglas.
    const el = montar(
      svgTexto('viewBox="0 0 100 50"', '<defs id="d"><marker id="m"/></defs><style id="s">text{fill:red}</style><rect id="a"/>')
    )
    rotateSvgQuarterTurn(el)
    const g = el.querySelector('g')!
    expect(g.querySelector('#d')).toBeNull()
    expect(g.querySelector('#s')).toBeNull()
    expect(g.querySelector('#a')).not.toBeNull()
    // Y siguen en el SVG, no se han perdido.
    expect(el.querySelector('#d')).not.toBeNull()
    expect(el.querySelector('#s')).not.toBeNull()
  })

  it('no hace nada si el SVG no declara tamaño', () => {
    const el = montar('<svg xmlns="http://www.w3.org/2000/svg"><rect id="a"/></svg>')
    rotateSvgQuarterTurn(el)
    expect(el.querySelector('g')).toBeNull()
    expect(el.querySelector('#a')).not.toBeNull()
  })

  it('girar dos veces devuelve los ejes al orden original', () => {
    const el = montar(svgTexto('viewBox="0 0 300 200"'))
    rotateSvgQuarterTurn(el)
    rotateSvgQuarterTurn(el)
    expect(el.getAttribute('viewBox')).toBe('0 0 300 200')
  })
})
