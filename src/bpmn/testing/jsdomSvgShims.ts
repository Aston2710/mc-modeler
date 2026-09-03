/**
 * Shims de jsdom para poder arrancar un bpmn-js real en las pruebas.
 *
 * jsdom no implementa `CSS.escape` (lo usa la Palette de diagram-js) ni las
 * APIs de geometría y de transformaciones de SVG que bpmn-js toca al
 * renderizar. Sin esto, `new Modeler(...)` revienta antes de importar nada.
 *
 * Extraído de `connections/routing.integration.test.ts`, que llevaba la misma
 * lista en línea. Se centraliza aquí para que una prueba nueva que necesite el
 * motor real no tenga que volver a descubrirla ni copiarla.
 *
 * NO es un polyfill de producción: los valores son los mínimos que hacen que
 * el motor arranque y opere. En particular `getBBox` devuelve ceros, así que
 * nada que dependa de medidas reales de texto puede afirmarse en jsdom.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

export function installJsdomSvgShims(): void {
  const g = globalThis as Any

  if (!g.CSS) g.CSS = {}
  if (!g.CSS.escape) {
    g.CSS.escape = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
  }

  const proto = SVGElement.prototype as Any
  if (!proto.getBBox) {
    proto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })
  }

  const makeMatrix = (init?: Any) => ({
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    ...init,
    inverse() { return makeMatrix() },
    multiply() { return this },
    translate() { return this },
    scale() { return this },
  })

  if (!g.SVGMatrix) g.SVGMatrix = class SVGMatrix {}

  class FakeTransformList {
    items: Any[] = []
    clear() { this.items = [] }
    appendItem(t: Any) { this.items.push(t); return t }
    consolidate() {
      if (!this.items.length) return null
      const it = this.items[0]
      return it.matrix ? it : { matrix: it }
    }
    createSVGTransformFromMatrix(m: Any) {
      return { matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} }
    }
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'transform')) {
    Object.defineProperty(proto, 'transform', {
      get() {
        if (!this.__tl) this.__tl = { baseVal: new FakeTransformList() }
        return this.__tl
      },
      configurable: true,
    })
  }

  const svgProto = g.SVGSVGElement?.prototype
  if (svgProto) {
    if (!svgProto.createSVGMatrix) svgProto.createSVGMatrix = () => makeMatrix()
    if (!svgProto.createSVGTransformFromMatrix) {
      svgProto.createSVGTransformFromMatrix = (m: Any) => ({ matrix: m, setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    }
    if (!svgProto.createSVGTransform) {
      svgProto.createSVGTransform = () => ({ matrix: makeMatrix(), setMatrix() {}, setTranslate() {}, setRotate() {}, setScale() {} })
    }
    if (!svgProto.createSVGPoint) {
      svgProto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) })
    }
  }
}
