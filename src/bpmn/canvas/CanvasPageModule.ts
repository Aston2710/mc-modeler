/**
 * CanvasPageModule.ts
 *
 * Bizagi-style bounded canvas:
 * - Origin (0,0) is fixed top-left — viewport clamps to x≥0, y≥0
 * - Canvas expands right/down as elements grow beyond current bounds
 * - Exposes getBounds() so scrollbars reflect the real scrollable area
 * - No visual page rect (background stays as-is)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const INITIAL_W = 1920
const INITIAL_H = 1080
const PADDING = 80

type Bounds = { x: 0; y: 0; w: number; h: number }

class CanvasPage {
  static $inject = ['canvas', 'eventBus', 'elementRegistry']

  private _canvas: AnyObj
  private _elementRegistry: AnyObj
  private _bounds: Bounds = { x: 0, y: 0, w: INITIAL_W, h: INITIAL_H }
  private _expandTimer: ReturnType<typeof setTimeout> | null = null
  private _clamping = false

  constructor(canvas: AnyObj, eventBus: AnyObj, elementRegistry: AnyObj) {
    this._canvas = canvas
    this._elementRegistry = elementRegistry

    // Clamp viewport: [0, bounds.w - vb.width] × [0, bounds.h - vb.height]
    eventBus.on('canvas.viewbox.changed', () => {
      if (this._clamping) return
      const vb = this._canvas.viewbox()
      const maxX = Math.max(0, this._bounds.w - vb.width)
      const maxY = Math.max(0, this._bounds.h - vb.height)
      const cx = Math.max(0, Math.min(maxX, vb.x))
      const cy = Math.max(0, Math.min(maxY, vb.y))
      if (cx !== vb.x || cy !== vb.y) {
        this._clamping = true
        this._canvas.viewbox({ x: cx, y: cy, width: vb.width, height: vb.height })
        this._clamping = false
      }
    })

    // Expand tracked bounds right/down as elements grow
    eventBus.on('commandStack.changed', () => this._scheduleExpand())
    eventBus.on('import.done', () => this._fitToContent())
  }

  getBounds(): Bounds {
    return { ...this._bounds } as Bounds
  }

  private _getContentBounds(): { maxX: number; maxY: number } | null {
    const elements: AnyObj[] = this._elementRegistry.getAll().filter((el: AnyObj) =>
      el.parent &&
      !el.waypoints &&
      el.type !== '__implicitroot' &&
      typeof el.x === 'number'
    )
    if (!elements.length) return null
    let maxX = -Infinity, maxY = -Infinity
    for (const el of elements) {
      maxX = Math.max(maxX, el.x + (el.width ?? 0))
      maxY = Math.max(maxY, el.y + (el.height ?? 0))
    }
    return isFinite(maxX) ? { maxX, maxY } : null
  }

  private _scheduleExpand() {
    if (this._expandTimer) clearTimeout(this._expandTimer)
    this._expandTimer = setTimeout(() => {
      this._autoExpand()
      this._expandTimer = null
    }, 60)
  }

  private _autoExpand() {
    const bb = this._getContentBounds()
    if (!bb) return
    let { w, h } = this._bounds
    let changed = false
    if (bb.maxX + PADDING > w) { w = bb.maxX + PADDING; changed = true }
    if (bb.maxY + PADDING > h) { h = bb.maxY + PADDING; changed = true }
    if (changed) this._bounds = { x: 0, y: 0, w, h }
  }

  private _fitToContent() {
    const bb = this._getContentBounds()
    this._bounds = {
      x: 0,
      y: 0,
      w: Math.max(INITIAL_W, bb ? bb.maxX + PADDING : INITIAL_W),
      h: Math.max(INITIAL_H, bb ? bb.maxY + PADDING : INITIAL_H),
    }
  }
}

export default {
  __init__: ['canvasPage'],
  canvasPage: ['type', CanvasPage],
}
