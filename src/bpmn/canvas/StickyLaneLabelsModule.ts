/**
 * StickyLaneLabelsModule.ts — sticky pool/lane label overlay.
 *
 * Al hacer scroll horizontal, las etiquetas de pool y lane desaparecen
 * por la izquierda. Este módulo crea un overlay HTML que las ancla al
 * borde izquierdo del viewport cuando el diagrama se scrollea (estilo Bizagi).
 *
 * - Solo activa cuando naturalPoolLabelX < 0 (etiqueta fuera de pantalla).
 * - pointer-events: none → no bloquea interacciones con el canvas.
 * - Usa CSS vars del tema (--pool-fill, --lane-fill, --pool-stroke, --text-2).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// Ancho de la columna de etiquetas (unidades de diagrama, igual que bpmn-js)
const POOL_LABEL_W = 30
const LANE_LABEL_W = 30

function isPool(el: AnyObj): boolean {
  return !!el?.businessObject?.$instanceOf?.('bpmn:Participant')
}
function isLane(el: AnyObj): boolean {
  return !!el?.businessObject?.$instanceOf?.('bpmn:Lane')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StickyLaneLabels(this: any, eventBus: AnyObj, canvas: AnyObj, elementRegistry: AnyObj) {
  this._canvas = canvas
  this._elementRegistry = elementRegistry
  this._overlay = null

  const self = this

  eventBus.on('canvas.init', () => {
    const container = canvas.getContainer() as HTMLElement
    if (!container) return

    const overlay = document.createElement('div')
    overlay.setAttribute('data-sticky-labels', 'true')
    overlay.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'overflow:hidden',
      'z-index:2',
    ].join(';')

    container.appendChild(overlay)
    self._overlay = overlay
  })

  let raf: number | null = null
  const schedule = () => {
    if (raf !== null) return
    raf = requestAnimationFrame(() => {
      raf = null
      if (self._overlay) self._update()
    })
  }

  eventBus.on('canvas.viewbox.changed', schedule)
  eventBus.on('import.done', schedule)
  eventBus.on('commandStack.changed', schedule)
  eventBus.on('element.changed', schedule)
  eventBus.on('shape.added', schedule)
  eventBus.on('shape.removed', schedule)

  eventBus.on('diagram.destroy', () => {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null }
    self._overlay?.remove()
    self._overlay = null
  })
}

StickyLaneLabels.$inject = ['eventBus', 'canvas', 'elementRegistry']

StickyLaneLabels.prototype._update = function (): void {
  const overlay = this._overlay as HTMLElement
  const vb = this._canvas.viewbox()
  const s: number = vb.scale
  const cH: number = overlay.clientHeight
  const cW: number = overlay.clientWidth

  overlay.innerHTML = ''

  this._elementRegistry.forEach((el: AnyObj) => {
    if (!isPool(el)) return
    const pool = el

    const poolScrYTop = Math.round((pool.y - vb.y) * s)
    const poolScrYBot = Math.round((pool.y + pool.height - vb.y) * s)
    const poolScrH = poolScrYBot - poolScrYTop
    const poolScrX = (pool.x - vb.x) * s
    const poolRightScrX = poolScrX + pool.width * s

    // Fuera del viewport
    if (poolScrYBot < 0 || poolScrYTop > cH) return
    if (poolRightScrX < 0 || poolScrX > cW) return

    // Modo sticky: etiqueta de pool fuera de pantalla por la izquierda
    if (poolScrX >= 0) return

    const poolLabelScrW = Math.round(POOL_LABEL_W * s)
    if (poolRightScrX < poolLabelScrW + 4) return

    this._renderLabel(overlay, {
      text: (pool.businessObject?.name ?? '').trim(),
      x: 0,
      y: poolScrYTop,
      w: poolLabelScrW,
      h: poolScrH,
      bg: 'var(--pool-fill)',
      s,
      leftBorder: true,
      rightBorder: true,
      topBorder: poolScrYTop >= 0,
      bottomBorder: poolScrYBot <= cH,
    })

    // Lanes hijas directas del pool
    const lanes: AnyObj[] = []
    this._elementRegistry.forEach((e: AnyObj) => {
      if (isLane(e) && e.parent?.id === pool.id) lanes.push(e)
    })
    if (lanes.length === 0) return

    const laneLabelScrW = Math.round(LANE_LABEL_W * s)
    const laneLabelScrX = poolLabelScrW

    if (poolRightScrX < laneLabelScrX + laneLabelScrW + 4) return

    lanes.forEach((lane: AnyObj) => {
      const laneScrYTop = Math.round((lane.y - vb.y) * s)
      const laneScrYBot = Math.round((lane.y + lane.height - vb.y) * s)
      const laneScrH = laneScrYBot - laneScrYTop
      if (laneScrYBot < 0 || laneScrYTop > cH) return

      // El primer lane comparte el borde superior del pool; el último comparte el inferior.
      // Sin estos bordes, el lane div tapa el borde SVG del pool en x=30–60px → "tarjeta".
      const isFirstLane = laneScrYTop === poolScrYTop
      const isLastLane  = laneScrYBot === poolScrYBot

      this._renderLabel(overlay, {
        text: (lane.businessObject?.name ?? '').trim(),
        x: laneLabelScrX,
        y: laneScrYTop,
        w: laneLabelScrW,
        h: laneScrH,
        bg: 'var(--lane-fill)',
        s,
        rightBorder: true,
        topBorder: isFirstLane && poolScrYTop >= 0,
        bottomBorder: isLastLane ? poolScrYBot <= cH : true,
      })
    })
  })
}

interface LabelOpts {
  text: string
  x: number
  y: number
  w: number
  h: number
  bg: string
  s: number
  leftBorder?: boolean
  rightBorder?: boolean
  topBorder?: boolean
  bottomBorder?: boolean
}

StickyLaneLabels.prototype._renderLabel = function (overlay: HTMLElement, opts: LabelOpts): void {
  const { text, x, y, w, h, bg, s } = opts

  const div = document.createElement('div')
  const borders: string[] = []
  if (opts.leftBorder)   borders.push('border-left:1.5px solid var(--pool-stroke)')
  if (opts.rightBorder)  borders.push('border-right:1.5px solid var(--pool-stroke)')
  if (opts.topBorder)    borders.push('border-top:1.5px solid var(--pool-stroke)')
  if (opts.bottomBorder) borders.push('border-bottom:1.5px solid var(--pool-stroke)')

  div.style.cssText = [
    'position:absolute',
    `left:${x}px`,
    `top:${y}px`,
    `width:${w}px`,
    `height:${h}px`,
    `background:${bg}`,
    ...borders,
    'box-sizing:border-box',
    'overflow:hidden',
  ].join(';')

  if (text) {
    const span = document.createElement('span')
    const maxTextW = Math.max(20, h - 12)
    const fontSize = Math.max(8, Math.round(12 * s))
    span.style.cssText = [
      'position:absolute',
      'top:50%',
      'left:50%',
      `max-width:${maxTextW}px`,
      'transform:translate(-50%,-50%) rotate(-90deg)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      `font-size:${fontSize}px`,
      'font-family:Arial,sans-serif',
      'font-weight:400',
      'color:var(--text-2)',
      'line-height:1.2',
      'letter-spacing:0.01em',
      'user-select:none',
    ].join(';')
    span.textContent = text
    div.appendChild(span)
  }

  overlay.appendChild(div)
}

export default {
  __init__: ['stickyLaneLabels'],
  stickyLaneLabels: ['type', StickyLaneLabels],
}
