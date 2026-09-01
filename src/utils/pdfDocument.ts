/**
 * Composición de la página PDF: el diagrama en vectorial (PLAN-034 fase 1).
 *
 * POR QUÉ VECTORIAL. Hasta ahora el PDF llevaba **un mapa de bits**: el SVG se
 * rasterizaba y se metía con `addImage`. Al ampliar en el visor se veía borroso,
 * el texto no se podía seleccionar ni buscar, y el fichero pesaba de más. Y con
 * EXP-017 el ráster era además la ampliación de un render hecho a resolución de
 * coordenadas de diagrama: borroso sobre borroso.
 *
 * Importa porque los diagramas reales no caben legibles en una hoja. Medido
 * sobre los 177 de producción: en Carta vertical el 53 % sale por debajo de
 * 4 pt, y la proporción mediana (2.40:1) no la alcanza ninguna hoja estándar.
 * En vectorial eso deja de ser fatal — el lector amplía sin pérdida, que es
 * cómo se consumen estos documentos (un visor, no papel).
 *
 * Comprobado sobre 10 SVG reales antes de escribir esto (`spike-vector-pdf.mjs`):
 * cero imágenes incrustadas, fuentes base-14 sin incrustar, texto extraíble, los
 * marcadores de las flechas se dibujan, y **el `<style>` que inyecta
 * `injectThemeIntoSvg` se honra tal cual** — no hace falta volcarlo a atributos.
 * Peso frente al ráster de hoy: de 1 765 kB a 291 kB en el caso medido.
 *
 * `jspdf` y `svg2pdf.js` se cargan **bajo demanda**: exportar no está en el
 * camino crítico y son cientos de kB que no tienen por qué entrar al arranque.
 * `import type` se borra en compilación, así que tipar con el jsPDF real no
 * arrastra nada al grafo de módulos.
 */
import type { jsPDF } from 'jspdf'
import type { PageSpec } from './pageLayout'
import { pageDimensions, placement } from './pageLayout'

/** Caja del dibujo en unidades de diagrama, leída del `viewBox`. */
export function svgViewBox(svgText: string): { x: number; y: number; width: number; height: number } {
  const m = /\bviewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svgText)
  if (m) {
    return { x: parseFloat(m[1]), y: parseFloat(m[2]), width: parseFloat(m[3]), height: parseFloat(m[4]) }
  }
  const w = /\bwidth="([\d.]+)"/.exec(svgText)
  const h = /\bheight="([\d.]+)"/.exec(svgText)
  return { x: 0, y: 0, width: w ? parseFloat(w[1]) : 0, height: h ? parseFloat(h[1]) : 0 }
}

/** Elementos que no se dibujan y por tanto no deben entrar en el grupo girado. */
const NO_RENDERIZABLES = new Set(['defs', 'style', 'title', 'desc', 'metadata'])

/**
 * Gira el contenido del SVG +90° —en el sentido de las agujas del reloj— dentro
 * del propio SVG, dejándolo con los ejes intercambiados.
 *
 * **EL SENTIDO IMPORTA Y ANTES ESTABA AL REVÉS.** Con −90° un diagrama que se lee
 * de izquierda a derecha salía **de abajo hacia arriba**: para seguirlo había que
 * empezar por el pie de la hoja. Con +90° el mismo flujo baja de arriba abajo,
 * que es como se lee una página. Lo reportó el usuario mirándolo, y es la
 * comprobación que vale.
 *
 * **`svg2pdf` no tiene opción de rotación** — comprobado en sus tipos, solo
 * acepta `x`, `y`, `width`, `height` y `loadExternalStyleSheets`. Así que el giro
 * se hace en el origen.
 *
 * La matriz: rotar +90° lleva `(x, y)` a `(−y, x)`. Para que la caja
 * `[minX, minX+W] × [minY, minY+H]` caiga en `[0, H] × [0, W]` hay que trasladar
 * después con `(minY + H, −minX)`. En SVG la lista se aplica de derecha a
 * izquierda, de ahí `translate(...) rotate(90)`.
 *
 * `defs` y `style` se quedan fuera del grupo: los marcadores se referencian por
 * URL y las reglas CSS aplican a todo el documento, así que moverlos no aporta
 * nada y sí podría alterar el orden de resolución.
 */
export function rotateSvgQuarterTurn(svg: SVGSVGElement): void {
  const vb = svg.viewBox?.baseVal
  const minX = vb?.width ? vb.x : 0
  const minY = vb?.width ? vb.y : 0
  const w = vb?.width || svg.width?.baseVal?.value || 0
  const h = vb?.height || svg.height?.baseVal?.value || 0
  if (!(w > 0) || !(h > 0)) return

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('transform', `translate(${minY + h}, ${-minX}) rotate(90)`)

  for (const child of Array.from(svg.childNodes)) {
    const nombre = (child as Element).nodeName?.toLowerCase?.()
    if (child.nodeType === 1 && NO_RENDERIZABLES.has(nombre)) continue
    g.appendChild(child)
  }
  svg.appendChild(g)

  // Los ejes quedan intercambiados: el alto original pasa a ser el ancho.
  svg.setAttribute('viewBox', `0 0 ${h} ${w}`)
  svg.setAttribute('width', String(h))
  svg.setAttribute('height', String(w))
}

/**
 * Monta el SVG en el DOM, fuera de la vista.
 *
 * `svg2pdf` necesita un elemento vivo y medible, no una cadena: recorre el DOM
 * y consulta estilos calculados. Un contenedor de 0×0 haría que todo midiese
 * cero, así que se le da tamaño y se aparta desplazándolo.
 */
function mountSvg(svgText: string): { el: SVGSVGElement; dispose: () => void } {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-100000px;top:0;width:2000px;height:2000px;pointer-events:none;'
  host.innerHTML = svgText
  document.body.appendChild(host)
  const el = host.querySelector('svg')
  if (!el) {
    host.remove()
    throw new Error('El SVG exportado no se pudo interpretar')
  }
  return { el: el as SVGSVGElement, dispose: () => host.remove() }
}

export interface PdfPageOptions {
  spec: PageSpec
  /** Color de fondo de la hoja. */
  background: string
  /** Se llama con el documento ya creado, antes del diagrama: dibuja la cabecera. */
  drawHeader?: (pdf: jsPDF, page: { width: number; height: number }) => void | Promise<void>
}

/**
 * Compone la hoja y devuelve el PDF, con el diagrama **en vectorial**.
 *
 * El giro no rota la hoja: el documento conserva la orientación pedida y solo
 * el dibujo va de lado, que es lo que permite respetar un estándar que exija
 * hoja vertical sin condenar los diagramas anchos.
 */
export async function renderDiagramPdf(svgText: string, opts: PdfPageOptions): Promise<Blob> {
  const [{ jsPDF: JsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])

  const { spec, background, drawHeader } = opts
  const page = pageDimensions(spec)
  const box = svgViewBox(svgText)
  if (!(box.width > 0) || !(box.height > 0)) throw new Error('El diagrama no declara tamaño')

  const pdf = new JsPDF({
    orientation: spec.orientation,
    unit: 'mm',
    format: [page.width, page.height],
    // Sin esto jsPDF escribe los flujos de contenido EN CLARO. Se descubrió al
    // inspeccionar un PDF generado: 173 streams, ninguno comprimido, 265 kB
    // para un diagrama que comprimido baja mucho. Un diagrama BPMN es texto muy
    // repetitivo, así que comprime bien y el coste en tiempo es despreciable.
    compress: true,
  })

  pdf.setFillColor(background)
  pdf.rect(0, 0, page.width, page.height, 'F')

  await drawHeader?.(pdf, page)

  // `placement` ya devuelve lo que el dibujo OCUPA en la hoja, con el giro
  // aplicado. Como el SVG también se gira, sus ejes coinciden con ese hueco y
  // no hay que volver a intercambiar nada aquí.
  const place = placement(spec, box.width, box.height)
  const { el, dispose } = mountSvg(svgText)
  try {
    if (spec.rotateDiagram) rotateSvgQuarterTurn(el)
    await svg2pdf(el, pdf, {
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
    })
  } finally {
    dispose()
  }

  return pdf.output('blob')
}
