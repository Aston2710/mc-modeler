/**
 * DocumentFrameModule.ts — la cabecera del documento, visible en el lienzo.
 *
 * PLAN-034 fase 4. Responde a lo que pidió el equipo de procesos —ver la
 * cabecera mientras se dibuja, no solo al exportar— **sin meter nada en el
 * modelo**, que es la línea que traza D-A del plan.
 *
 * TRES COSAS QUE NO HACE, Y SON EL PUNTO:
 *
 * 1. **No crea elementos.** Ni `bpmn:Group`, ni `TextAnnotation`, ni una forma
 *    propia. Es una capa HTML sobre el contenedor del canvas. Consecuencia
 *    directa: el `.bpmn` exportado no lleva ni rastro de la cabecera, se puede
 *    abrir en otro modelador, y el routing y la colaboración no lo ven.
 * 2. **No se puede seleccionar ni mover** (`pointer-events: none`). No es
 *    contenido del diagrama: es el marco de la hoja, como el cuadro de rótulos
 *    de un plano. Se edita donde vive el dato —el panel Documento y la vista de
 *    exportación—, no arrastrándolo.
 * 3. **No escribe.** Solo lee `flujo:DocumentMeta` del elemento raíz. Si el
 *    diagrama no tiene datos, muestra los huecos.
 *
 * DÓNDE SE DIBUJA. Justo encima del contenido, abarcando su anchura: es donde
 * caerá impreso, porque en la hoja la banda ocupa el ancho de la zona de dibujo
 * y el diagrama se ajusta a ese mismo ancho (medido: la mediana de los 177
 * diagramas es 2,40:1 contra 1,79 de la mejor hoja, así que el límite es
 * siempre el ancho). La proporción alto/ancho se toma de la hoja por defecto
 * —Carta apaisada con margen de 12,7 mm—; quien exporte en otra hoja verá la
 * medida exacta en la vista de exportación, que es la que manda.
 *
 * Si el contenido empieza tan arriba que la banda no cabe sobre él, se apoya en
 * el origen del lienzo y queda **traslúcida**: se solapa, pero no esconde nada.
 * Preferible a moverle los elementos al usuario por decisión nuestra.
 */
import { DEFAULT_PAGE_SPEC, drawingArea, MM_PER_POINT } from '@/utils/pageLayout'
import { columnWidths, documentHeaderHeight, type DocumentHeaderTemplate } from '@/utils/documentHeader'
import { EMPTY_DOCUMENT_META, readDocumentMeta, type DocumentMeta } from './../elements/documentMeta'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

/** Ancho de referencia de la banda, en mm: la zona de dibujo de la hoja por defecto. */
const REFERENCE_BAND_MM = drawingArea({ ...DEFAULT_PAGE_SPEC, headerHeight: 0 }).width

/** Aire entre la banda y el contenido, en unidades de diagrama. */
const GAP = 12

/** Por debajo de esto la banda es un borrón: no se dibuja. */
const MIN_SCREEN_HEIGHT = 6

class DocumentFrame {
  static $inject = ['eventBus', 'canvas', 'elementRegistry']

  private _canvas: AnyObj
  private _registry: AnyObj
  private _overlay: HTMLElement | null = null
  private _tpl: DocumentHeaderTemplate | null = null
  /**
   * Nace apagada: nada se dibuja hasta que alguien lo pida. La preferencia
   * también sale apagada, así que el lienzo empieza limpio.
   */
  private _visible = false
  /**
   * Bandera y id van SEPARADOS a propósito. Con `if (this._raf !== null)` como
   * único guardia, un `requestAnimationFrame` que ejecute su callback antes de
   * devolver el id deja `_raf` con un id ya consumido —el callback lo puso a
   * null y luego la asignación lo vuelve a llenar—, y a partir de ahí ningún
   * repintado más se programa. Con la bandera, el orden deja de importar.
   */
  private _pending = false
  private _raf: number | null = null

  constructor(eventBus: AnyObj, canvas: AnyObj, elementRegistry: AnyObj) {
    this._canvas = canvas
    this._registry = elementRegistry

    eventBus.on('canvas.init', () => {
      const container = canvas.getContainer() as HTMLElement | null
      if (!container) return
      const overlay = document.createElement('div')
      overlay.setAttribute('data-document-frame', 'true')
      overlay.className = 'doc-frame'
      container.appendChild(overlay)
      this._overlay = overlay
      this._schedule()
    })

    for (const ev of [
      'canvas.viewbox.changed', 'import.done', 'commandStack.changed',
      'element.changed', 'shape.added', 'shape.removed',
    ]) {
      eventBus.on(ev, () => this._schedule())
    }

    eventBus.on('diagram.destroy', () => {
      if (this._raf !== null) { cancelAnimationFrame(this._raf); this._raf = null }
      this._pending = false
      this._overlay?.remove()
      this._overlay = null
    })
  }

  /** La plantilla vive en el proyecto, así que entra desde fuera (React). */
  setTemplate(tpl: DocumentHeaderTemplate | null): void {
    this._tpl = tpl
    this._schedule()
  }

  /** Interruptor de la vista. No cambia nada de lo que se exporta. */
  setVisible(visible: boolean): void {
    this._visible = visible
    this._schedule()
  }

  private _schedule(): void {
    if (this._pending || !this._overlay) return
    this._pending = true
    this._raf = requestAnimationFrame(() => {
      this._pending = false
      this._raf = null
      if (this._overlay) this._render()
    })
  }

  /** Extensión del contenido en unidades de diagrama, o null si está vacío. */
  private _contentBounds(): { x: number; y: number; width: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity
    this._registry.forEach((el: AnyObj) => {
      // Las conexiones no cuentan: sus `waypoints` no acotan una caja, y una
      // flecha que sale por arriba estiraría la banda sin motivo.
      if (!el.parent || el.waypoints || typeof el.x !== 'number') return
      if (el.type === '__implicitroot' || el.type === 'label') return
      minX = Math.min(minX, el.x)
      minY = Math.min(minY, el.y)
      maxX = Math.max(maxX, el.x + (el.width ?? 0))
    })
    if (!isFinite(minX) || maxX <= minX) return null
    return { x: minX, y: minY, width: maxX - minX }
  }

  private _meta(): DocumentMeta {
    try {
      const raiz = this._canvas.getRootElement?.()
      return raiz ? readDocumentMeta(raiz) : { ...EMPTY_DOCUMENT_META }
    } catch {
      return { ...EMPTY_DOCUMENT_META }
    }
  }

  private _render(): void {
    const overlay = this._overlay as HTMLElement
    const tpl = this._tpl
    overlay.replaceChildren()

    if (!tpl || !tpl.enabled || !this._visible) return
    const alto = documentHeaderHeight(tpl)
    if (alto <= 0) return

    const contenido = this._contentBounds()
    if (!contenido) return

    const vb = this._canvas.viewbox()
    const s: number = vb.scale

    // De mm a unidades de diagrama: la banda mide `alto` mm sobre un ancho de
    // referencia, y en el lienzo abarca el ancho del contenido.
    const h = (alto / REFERENCE_BAND_MM) * contenido.width
    const y = Math.max(0, contenido.y - h - GAP)

    const sx = (contenido.x - vb.x) * s
    const sy = (y - vb.y) * s
    const sw = contenido.width * s
    const sh = h * s
    if (sh < MIN_SCREEN_HEIGHT) return

    // Fuera del viewport: no vale la pena montar los nodos. El tamaño visible
    // sale del viewbox (unidades × escala = píxeles) y no de medir el DOM: la
    // capa acaba de crearse y su `clientWidth` depende del reflujo.
    if (sy + sh < 0 || sx + sw < 0) return
    if (sy > vb.height * s || sx > vb.width * s) return

    const banda = document.createElement('div')
    banda.className = 'doc-frame__band'
    // Solapado = traslúcido, para no esconder lo que hay debajo.
    if (y + h + GAP > contenido.y) banda.classList.add('is-overlapping')
    banda.style.left = `${sx}px`
    banda.style.top = `${sy}px`
    banda.style.width = `${sw}px`
    banda.style.height = `${sh}px`
    banda.style.borderColor = tpl.borderColor
    banda.style.color = tpl.textColor
    // El cuerpo escala con la banda: la misma proporción que en el PDF.
    banda.style.fontSize = `${(tpl.fontSize * MM_PER_POINT / alto) * sh}px`

    const [f0, f1, f2] = columnWidths(tpl, 1)
    const meta = this._meta()

    banda.appendChild(this._logoCell(tpl, f0))
    banda.appendChild(this._titleCell(tpl, meta, f1))
    banda.appendChild(this._rowsCell(tpl, meta, f2))

    overlay.appendChild(banda)
  }

  private _cell(fraction: number, extra: string): HTMLElement {
    const cel = document.createElement('div')
    cel.className = `doc-frame__cell ${extra}`
    cel.style.width = `${fraction * 100}%`
    return cel
  }

  private _logoCell(tpl: DocumentHeaderTemplate, fraction: number): HTMLElement {
    const cel = this._cell(fraction, 'doc-frame__cell--logo')
    if (tpl.logo) {
      const img = document.createElement('img')
      img.src = tpl.logo
      img.alt = ''
      cel.appendChild(img)
    }
    return cel
  }

  private _titleCell(tpl: DocumentHeaderTemplate, meta: DocumentMeta, fraction: number): HTMLElement {
    const cel = this._cell(fraction, 'doc-frame__cell--title')
    const texto = (meta[tpl.titleField] || '').trim()
    // Sin dato no se inventa un título: el hueco se ve, y eso es el aviso.
    if (texto) cel.textContent = texto
    else cel.classList.add('is-empty')
    return cel
  }

  private _rowsCell(tpl: DocumentHeaderTemplate, meta: DocumentMeta, fraction: number): HTMLElement {
    const cel = this._cell(fraction, 'doc-frame__cell--rows')
    for (const fila of tpl.rows) {
      const linea = document.createElement('div')
      linea.className = 'doc-frame__line'
      const et = document.createElement('span')
      et.className = 'doc-frame__label'
      et.textContent = fila.label
      const val = document.createElement('span')
      const dato = (meta[fila.field] || '').trim()
      val.className = dato ? 'doc-frame__value' : 'doc-frame__value is-empty'
      val.textContent = dato || '—'
      linea.append(et, val)
      cel.appendChild(linea)
    }
    return cel
  }
}

export default {
  __init__: ['documentFrame'],
  documentFrame: ['type', DocumentFrame],
}
