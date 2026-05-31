/**
 * PhaseModule.ts — la Fase como banda vertical anclada al pool (estilo Bizagi).
 *
 * - Al crear una fase dentro de un pool: abarca todo el alto del pool y se ancla
 *   como columna contigua a las fases existentes.
 * - Solo se ensancha por el borde derecho (x/y/alto fijos = pool; solo varía width).
 * - Si el pool cambia de tamaño/posición, las fases se reajustan solas.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — diagram-js CommonJS sin tipos completos
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'
import { isPhase, setPhaseName } from './phaseUtil'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const LANE_HEADER = 30   // franja del nombre del pool a la izquierda
const MIN_WIDTH = 120

function isPool(el: AnyObj): boolean {
  const bo = el?.businessObject
  return !!bo?.$instanceOf?.('bpmn:Participant')
}

function centerX(el: AnyObj): number { return el.x + el.width / 2 }
function centerY(el: AnyObj): number { return el.y + el.height / 2 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PhaseModule(this: any, eventBus: any, modeling: any, elementRegistry: any) {
  CommandInterceptor.call(this, eventBus)
  this._modeling = modeling
  this._registry = elementRegistry
  this._busy = false
  const self = this

  // Tras crear una fase → anclarla y recolocar columnas.
  this.postExecuted(['shape.create'], (event: AnyObj) => {
    const shape = event.context.shape
    if (isPhase(shape)) self.onPhaseAdded(shape)
  })

  // Tras mover/redimensionar: si es fase → normalizar (solo width); si es pool → seguir.
  this.postExecuted(['shape.move', 'shape.resize', 'elements.move'], (event: AnyObj) => {
    if (self._busy) return
    const ctx = event.context
    const shapes: AnyObj[] = ctx.shapes || (ctx.shape ? [ctx.shape] : [])
    for (const s of shapes) {
      if (isPhase(s)) { self.onPhaseChanged(s); return }
      if (isPool(s)) { self.reflow(s); return }
    }
  })

  // Renombrar una fase: escribir en bo.name y NO crear el external label nativo
  // del Group (que produciría un nombre duplicado). Dejamos newLabel vacío para
  // que el handler nativo no genere categoryValueRef.
  this.preExecute('element.updateLabel', 2000, (event: AnyObj) => {
    const ctx = event.context
    const el = ctx.element
    if (!isPhase(el)) return
    // Persistir en flujo:phaseName (bpmn:Group no serializa `name`).
    setPhaseName(el, ctx.newLabel || '')
    ctx.newLabel = ''
    eventBus.fire('element.changed', { element: el })
  })
}
inherits(PhaseModule, CommandInterceptor)
PhaseModule.$inject = ['eventBus', 'modeling', 'elementRegistry']

PhaseModule.prototype.getPool = function (phase: AnyObj): AnyObj | null {
  const cx = centerX(phase)
  const cy = centerY(phase)
  let found: AnyObj | null = null
  this._registry.forEach((el: AnyObj) => {
    if (!isPool(el)) return
    if (cx >= el.x && cx <= el.x + el.width && cy >= el.y && cy <= el.y + el.height) {
      found = el
    }
  })
  return found
}

PhaseModule.prototype.getPhases = function (pool: AnyObj): AnyObj[] {
  const phases: AnyObj[] = []
  this._registry.forEach((el: AnyObj) => {
    if (!isPhase(el)) return
    if (centerX(el) >= pool.x && centerX(el) <= pool.x + pool.width) phases.push(el)
  })
  return phases.sort((a, b) => a.x - b.x)
}

PhaseModule.prototype.onPhaseAdded = function (phase: AnyObj): void {
  const pool = this.getPool(phase)
  if (!pool) return
  this.reflow(pool, phase)
}

PhaseModule.prototype.onPhaseChanged = function (phase: AnyObj): void {
  const pool = this.getPool(phase)
  if (!pool) return
  this.reflow(pool)
}

// Recoloca las fases del pool como columnas contiguas que abarcan todo el alto.
// `justAdded` (opcional) se ubica al final.
PhaseModule.prototype.reflow = function (pool: AnyObj, justAdded?: AnyObj): void {
  if (this._busy) return
  this._busy = true
  try {
    const modeling = this._modeling
    let phases = this.getPhases(pool)
    if (justAdded && !phases.includes(justAdded)) phases.push(justAdded)
    // Orden: por x; el recién añadido al final si comparte x.
    phases.sort((a: AnyObj, b: AnyObj) => a.x - b.x)

    let cursorX = pool.x + LANE_HEADER
    const y = pool.y
    const height = pool.height
    for (const ph of phases) {
      const width = Math.max(MIN_WIDTH, Math.round(ph.width))
      const target = { x: cursorX, y, width, height }
      if (ph.x !== target.x || ph.y !== target.y || ph.width !== target.width || ph.height !== target.height) {
        modeling.resizeShape(ph, target)
      }
      cursorX += width
    }
  } finally {
    this._busy = false
  }
}

const Module = {
  __init__: ['phaseModule'],
  phaseModule: ['type', PhaseModule],
}

export default Module
