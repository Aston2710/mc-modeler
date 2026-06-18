/**
 * PhaseModule.ts — la Fase como banda vertical que TESELA el pool (estilo Bizagi).
 *
 * Comportamiento replicado de Bizagi Modeler:
 * - Las fases dividen el pool en columnas contiguas que SIEMPRE suman el ancho
 *   útil del pool (sin huecos ni solapes). Cruzan todos los lanes (alto = pool).
 * - 1ª fase → ocupa todo el ancho útil del pool.
 * - N-ésima fase → se añade a la derecha y el pool CRECE para alojarla.
 * - Redimensionar una fase → reparte el ancho con la fase vecina (el pool
 *   conserva su ancho); en la última fase, crece el pool.
 * - Redimensionar el pool → las fases se reescalan proporcionalmente.
 * - Las fases empiezan tras las columnas de etiqueta (nombre del pool + del lane).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — diagram-js CommonJS sin tipos completos
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'
import { isPhase, setPhaseName, getPhaseName, setPhaseColor, DEFAULT_PHASE_COLOR } from './phaseUtil'
import { ELEMENT_SIZES } from '../ElementSizes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const POOL_LABEL = 30   // franja del nombre del pool (izquierda)
const LANE_LABEL = 30   // franja del nombre del lane (izquierda, si hay lanes)
const MIN_WIDTH = 200   // ancho mínimo de una fase (Bizagi: MinimumSize = 200×50)
const NEW_PHASE_WIDTH = ELEMENT_SIZES.phase.width // ancho al añadir la 2ª+ fase

function isPool(el: AnyObj): boolean {
  const bo = el?.businessObject
  return !!bo?.$instanceOf?.('bpmn:Participant')
}
function isLane(el: AnyObj): boolean {
  const bo = el?.businessObject
  return !!bo?.$instanceOf?.('bpmn:Lane')
}
function centerX(el: AnyObj): number { return el.x + el.width / 2 }
function centerY(el: AnyObj): number { return el.y + el.height / 2 }
function within(pool: AnyObj, cx: number, cy: number): boolean {
  return cx >= pool.x && cx <= pool.x + pool.width && cy >= pool.y && cy <= pool.y + pool.height
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PhaseModule(this: any, eventBus: any, modeling: any, elementRegistry: any) {
  CommandInterceptor.call(this, eventBus)
  this._modeling = modeling
  this._registry = elementRegistry
  this._eventBus = eventBus
  this._busy = false
  // Snapshot de anchos por fase (id → width) y del pool, para detectar el delta
  // de un resize y repartirlo con la vecina.
  this._snap = new Map()
  const self = this

  // Al cargar un diagrama, sanar fases con geometría inválida (NaN) heredadas de
  // versiones anteriores: re-teselan su pool. No-op si todo está sano (no marca
  // el diagrama como modificado).
  eventBus.on('import.done', () => self.healAll())

  // Renombrar una fase: persistir en flujo:phaseName y evitar el external label
  // nativo del Group (que duplicaría el nombre).
  this.preExecute('element.updateLabel', 2000, (event: AnyObj) => {
    const ctx = event.context
    const el = ctx.element
    if (!isPhase(el)) return
    setPhaseName(el, ctx.newLabel || '')
    ctx.newLabel = ''
    eventBus.fire('element.changed', { element: el })
  })

  // Tras crear una fase → numerar, colorear y teselar el pool.
  this.postExecuted(['shape.create'], (event: AnyObj) => {
    const shape = event.context.shape
    if (isPhase(shape)) self.onPhaseAdded(shape)
  })

  // Antes de un resize, captura los anchos actuales (old) para poder calcular el
  // delta y repartirlo con la vecina — robusto incluso en el primer resize tras
  // cargar un diagrama (cuando aún no hay snapshot).
  this.preExecute(['shape.resize'], (event: AnyObj) => {
    if (self._busy) return
    const shape = event.context.shape
    if (isPhase(shape)) { const pool = self.getPool(shape); if (pool) self.snapshot(pool) }
    else if (isPool(shape)) self.snapshot(shape)
  })

  // Resize de fase → repartir con la vecina. Resize de pool → reescalar fases.
  this.postExecuted(['shape.resize'], (event: AnyObj) => {
    if (self._busy) return
    const shape = event.context.shape
    if (isPhase(shape)) self.onPhaseResized(shape)
    else if (isPool(shape)) self.onPoolChanged(shape)
  })

  // Mover fase → reordenar/encajar en su slot. Mover pool → reubicar fases.
  this.postExecuted(['shape.move', 'elements.move'], (event: AnyObj) => {
    if (self._busy) return
    const ctx = event.context
    const shapes: AnyObj[] = ctx.shapes || (ctx.shape ? [ctx.shape] : [])
    for (const s of shapes) {
      if (isPhase(s)) { self.onPhaseMoved(s); return }
      if (isPool(s)) { self.onPoolChanged(s); return }
    }
  })

  // ANTES de borrar: (a) si se borra un pool, sus fases se borran con él;
  // (b) si se borra una fase, se anota su pool para re-teselar tras el borrado.
  // Hay que capturarlo aquí porque luego ya no se puede ubicar por posición.
  this.preExecute(['shape.delete', 'elements.delete'], (event: AnyObj) => {
    if (self._busy) return
    const ctx = event.context
    const removed: AnyObj[] = ctx.shapes || (ctx.shape ? [ctx.shape] : [])
    const victims: AnyObj[] = []
    const pools: AnyObj[] = []
    for (const s of removed) {
      if (isPool(s)) victims.push(...self.getPhases(s))
      else if (isPhase(s)) { const p = self.getPool(s); if (p && !pools.includes(p)) pools.push(p) }
    }
    if (victims.length) self.deferRemove(victims)
    self._poolsAfterDelete = pools
  })

  // DESPUÉS de borrar una fase → cerrar el hueco y encoger el pool afectado.
  this.postExecuted(['shape.delete', 'elements.delete'], (event: AnyObj) => {
    if (self._busy) return
    void event
    const pools: AnyObj[] = self._poolsAfterDelete || []
    self._poolsAfterDelete = []
    for (const pool of pools) {
      if (self._registry.get(pool.id)) self.onPhaseDeleted(pool)
    }
  })
}
inherits(PhaseModule, CommandInterceptor)
PhaseModule.$inject = ['eventBus', 'modeling', 'elementRegistry']

// ── consultas ───────────────────────────────────────────────────────────────

PhaseModule.prototype.getPool = function (phase: AnyObj): AnyObj | null {
  const cx = centerX(phase)
  const cy = centerY(phase)
  let found: AnyObj | null = null
  this._registry.forEach((el: AnyObj) => {
    if (isPool(el) && within(el, cx, cy)) found = el
  })
  return found
}

/** Fases del pool, ordenadas de izquierda a derecha. */
PhaseModule.prototype.getPhases = function (pool: AnyObj): AnyObj[] {
  const phases: AnyObj[] = []
  this._registry.forEach((el: AnyObj) => {
    if (isPhase(el) && centerX(el) >= pool.x && centerX(el) <= pool.x + pool.width) phases.push(el)
  })
  return phases.sort((a, b) => a.x - b.x)
}

/** Offset izquierdo: columna del pool + (columna del lane si hay lanes). */
PhaseModule.prototype.leftOffset = function (pool: AnyObj): number {
  let hasLanes = false
  this._registry.forEach((el: AnyObj) => {
    if (isLane(el) && within(pool, centerX(el), centerY(el))) hasLanes = true
  })
  return POOL_LABEL + (hasLanes ? LANE_LABEL : 0)
}

// ── operaciones ───────────────────────────────────────────────────────────────

PhaseModule.prototype.onPhaseAdded = function (phase: AnyObj): void {
  const pool = this.getPool(phase)
  // Una fase es parte de un pool: si se suelta fuera de todo pool, se cancela.
  if (!pool) { this.deferRemove([phase]); return }
  // Numerar y colorear si vienen vacías.
  const all = this.getPhases(pool)
  const idx = all.length // esta fase ya está incluida en getPhases
  if (!getPhaseName(phase)) setPhaseName(phase, `Fase ${idx}`)
  if (!phase.businessObject?.get?.('flujo:phaseColor')) setPhaseColor(phase, DEFAULT_PHASE_COLOR)

  const offset = this.leftOffset(pool)
  const others = all.filter((p: AnyObj) => p !== phase)

  this._busy = true
  try {
    if (others.length === 0) {
      // 1ª fase: ocupa todo el ancho útil del pool.
      const width = Math.max(MIN_WIDTH, pool.width - offset)
      this.tile(pool, [phase], [width], offset)
    } else {
      // N-ésima: se añade a la derecha y el pool CRECE para alojarla.
      const order = [...others, phase]
      const widths = others.map((p: AnyObj) => p.width)
      widths.push(NEW_PHASE_WIDTH)
      const newPoolWidth = offset + widths.reduce((a: number, b: number) => a + b, 0)
      this.resizePoolWidth(pool, newPoolWidth)
      this.tile(pool, order, widths, offset)
    }
  } finally {
    this._busy = false
  }
  this.snapshot(pool)
  this.refreshPhases(pool) // cambió el conjunto → recalcular cuál es la última
}

PhaseModule.prototype.onPhaseResized = function (phase: AnyObj): void {
  const pool = this.getPool(phase)
  if (!pool) return
  const offset = this.leftOffset(pool)
  const phases = this.getPhases(pool)
  const n = phases.length
  const idx = phases.indexOf(phase)
  if (idx < 0) return

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const prev = this._snap.get(phase.id)

  // Sin snapshot previo → normalizar fijando el último al borde del pool.
  if (!prev) {
    const widths = phases.map((p: AnyObj) => p.width)
    this._busy = true
    try { this.tile(pool, phases, this.fitToPool(widths, pool.width - offset), offset) }
    finally { this._busy = false }
    this.snapshot(pool)
    return
  }

  // ── Modelo de FRONTERAS ──────────────────────────────────────────────
  // b[0..n] son las posiciones de las fronteras relativas al inicio del
  // contenido (offset). Los EXTREMOS están fijados al pool: b[0]=0 (inicio)
  // y b[n]=ancho útil (borde derecho del pool). Solo se mueve la frontera
  // interna que el usuario arrastró → la última fase SIEMPRE llega al borde.
  const prevW = phases.map((p: AnyObj) => { const s = this._snap.get(p.id); return s ? s.w : p.width })
  const b: number[] = [0]
  for (let i = 0; i < n; i++) b.push(b[i] + prevW[i])

  let avail = pool.width - offset
  const newLeft  = Math.round(phase.x - (pool.x + offset))                 // frontera izq. arrastrada
  const newRight = Math.round(phase.x + phase.width - (pool.x + offset))   // frontera der. arrastrada
  const leftEdgeMoved = Math.abs(phase.x - prev.x) > 0.5

  let growPool = false
  if (leftEdgeMoved && idx > 0) {
    // Mover la frontera interna entre (idx-1) e idx.
    b[idx] = clamp(newLeft, b[idx - 1] + MIN_WIDTH, b[idx + 1] - MIN_WIDTH)
  } else if (!leftEdgeMoved && idx < n - 1) {
    // Mover la frontera interna entre idx e (idx+1).
    b[idx + 1] = clamp(newRight, b[idx] + MIN_WIDTH, b[idx + 2] - MIN_WIDTH)
  } else if (!leftEdgeMoved && idx === n - 1) {
    // Última fase, borde derecho = borde del pool → crece/encoge el pool.
    avail = Math.max(b[idx] + MIN_WIDTH, newRight)
    growPool = true
  }
  // (1ª fase borde izquierdo = inicio del pool: no se mueve.)

  // Fijar los extremos al pool y derivar anchos enteros exactos (sin deriva).
  b[0] = 0
  b[n] = avail
  // Reordenar por si algún redondeo cruzó una frontera contigua.
  for (let i = 1; i < n; i++) b[i] = clamp(b[i], b[i - 1] + MIN_WIDTH, b[n] - (n - i) * MIN_WIDTH)
  const widths: number[] = []
  for (let i = 0; i < n; i++) widths.push(b[i + 1] - b[i])

  this._busy = true
  try {
    if (growPool) this.resizePoolWidth(pool, offset + avail)
    this.tile(pool, phases, widths, offset)
  } finally {
    this._busy = false
  }
  this.snapshot(pool)
}

/** Ajusta una lista de anchos para que sumen EXACTAMENTE `avail`, absorbiendo la
 *  diferencia en la última fase (mínimo MIN_WIDTH). Garantiza que el tren de
 *  fases llene el pool sin deriva (la última llega al borde). */
PhaseModule.prototype.fitToPool = function (widths: number[], avail: number): number[] {
  const out = widths.map((w) => Math.max(MIN_WIDTH, Math.round(w)))
  const sumExceptLast = out.slice(0, -1).reduce((a: number, b: number) => a + b, 0)
  out[out.length - 1] = Math.max(MIN_WIDTH, Math.round(avail - sumExceptLast))
  return out
}

PhaseModule.prototype.onPhaseMoved = function (phase: AnyObj): void {
  const pool = this.getPool(phase)
  // Si se arrastró fuera de todo pool, devolverla a su posición previa (no puede
  // quedar suelta). _snap guarda los bounds del último estado válido.
  if (!pool) { this.revertPhase(phase); return }
  const offset = this.leftOffset(pool)
  const phases = this.getPhases(pool) // ya ordenadas por x → respeta el reorden
  const widths = phases.map((p: AnyObj) => p.width)
  this._busy = true
  try { this.tile(pool, phases, widths, offset) } finally { this._busy = false }
  this.snapshot(pool)
  this.refreshPhases(pool) // reordenar puede cambiar cuál es la última
}

PhaseModule.prototype.onPoolChanged = function (pool: AnyObj): void {
  const offset = this.leftOffset(pool)
  const phases = this.getPhases(pool)
  if (phases.length === 0) return
  if (!Number.isFinite(pool.width)) return

  const n = phases.length
  // El pool NUNCA puede ser más estrecho que sus fases (cada una ≥ MIN_WIDTH):
  // si el usuario lo encoge por debajo, lo devolvemos al mínimo para que las
  // fases no se salgan por el borde derecho.
  const minPoolWidth = offset + n * MIN_WIDTH
  this._busy = true
  try {
    if (pool.width < minPoolWidth) this.resizePoolWidth(pool, minPoolWidth)
    const avail = Math.max(n * MIN_WIDTH, pool.width - offset)

    // Reescalar proporcionalmente para teselar exactamente el ancho disponible.
    const prevSum = phases.reduce((a: number, p: AnyObj) => a + p.width, 0)
    const scale = prevSum > 0 && Number.isFinite(prevSum) ? avail / prevSum : 1
    const widths = phases.map((p: AnyObj) => Math.max(MIN_WIDTH, Math.round(p.width * scale)))
    // La última fase absorbe el remanente de redondeo → tesela sin huecos ni
    // desbordes (suma exacta = avail).
    const sumExceptLast = widths.slice(0, -1).reduce((a: number, b: number) => a + b, 0)
    widths[n - 1] = Math.max(MIN_WIDTH, Math.round(avail - sumExceptLast))

    this.tile(pool, phases, widths, offset)
  } finally {
    this._busy = false
  }
  this.snapshot(pool)
}

PhaseModule.prototype.onPhaseDeleted = function (pool: AnyObj): void {
  if (!pool || !isPool(pool)) return
  const offset = this.leftOffset(pool)
  const phases = this.getPhases(pool)
  if (phases.length === 0) { this.snapshot(pool); return }
  const widths = phases.map((p: AnyObj) => p.width)
  const newPoolWidth = offset + widths.reduce((a: number, b: number) => a + b, 0)
  this._busy = true
  try {
    this.resizePoolWidth(pool, newPoolWidth)
    this.tile(pool, phases, widths, offset)
  } finally {
    this._busy = false
  }
  this.snapshot(pool)
  this.refreshPhases(pool) // se borró una fase → recalcular cuál es la última
}

// ── helpers ───────────────────────────────────────────────────────────────

/** Coloca las fases como columnas contiguas (alto = pool) con los anchos dados. */
PhaseModule.prototype.tile = function (
  pool: AnyObj,
  phases: AnyObj[],
  widths: number[],
  offset: number,
): void {
  // Guarda anti-NaN: si el pool no tiene geometría válida, no tocar nada — un
  // único NaN aquí se propagaría al pool/lanes y rompería todo el render (SVG).
  if (![pool.x, pool.y, pool.width, pool.height].every((n) => Number.isFinite(n))) return
  let cursorX = pool.x + offset
  const y = pool.y
  const height = pool.height
  phases.forEach((ph: AnyObj, i: number) => {
    const raw = widths[i]
    const width = Math.max(MIN_WIDTH, Math.round(Number.isFinite(raw) ? raw : MIN_WIDTH))
    if (ph.x !== cursorX || ph.y !== y || ph.width !== width || ph.height !== height) {
      this._modeling.resizeShape(ph, { x: cursorX, y, width, height })
    }
    cursorX += width
  })
}

/** Sana fases con geometría NaN re-teselando su pool. No toca pools sanos. */
PhaseModule.prototype.healAll = function (): void {
  const pools: AnyObj[] = []
  this._registry.forEach((el: AnyObj) => { if (isPool(el)) pools.push(el) })
  for (const pool of pools) {
    // 1) Sanar lanes desalineados (diagramas guardados con el bug de coords).
    this.healLanes(pool)
    // 2) Re-teselar las fases (alinea al offset bpmn-js y sana NaN).
    const phases = this.getPhases(pool)
    if (phases.length === 0) continue
    this.onPoolChanged(pool)
  }
}

/** Re-alinea los lanes de un pool a la convención de bpmn-js (x = pool.x + 30,
 *  width = pool.width - 30, apilados desde pool.y). Solo actúa si están
 *  desalineados → corrige diagramas viejos guardados con el bug de coordenadas. */
PhaseModule.prototype.healLanes = function (pool: AnyObj): void {
  if (![pool.x, pool.y, pool.width, pool.height].every((n: number) => Number.isFinite(n))) return
  const lanes: AnyObj[] = []
  this._registry.forEach((el: AnyObj) => {
    if (isLane(el) && within(pool, centerX(el), centerY(el))) lanes.push(el)
  })
  if (lanes.length === 0) return
  lanes.sort((a, b) => a.y - b.y)
  const targetX = pool.x + POOL_LABEL
  const targetW = pool.width - POOL_LABEL
  const misaligned = lanes.some((l) => Math.abs(l.x - targetX) > 1 || Math.abs(l.width - targetW) > 1)
    || Math.abs(lanes[0].y - pool.y) > 1
  if (!misaligned) return
  this._busy = true
  try {
    let y = pool.y
    for (const l of lanes) {
      this._modeling.resizeShape(l, { x: targetX, y, width: targetW, height: l.height })
      y += l.height
    }
  } finally {
    this._busy = false
  }
}

/** Redimensiona el ancho del pool sólo si el valor es finito (anti-NaN). */
PhaseModule.prototype.resizePoolWidth = function (pool: AnyObj, width: number): void {
  if (!Number.isFinite(width)) return
  if (![pool.x, pool.y, pool.height].every((n: number) => Number.isFinite(n))) return
  this._modeling.resizeShape(pool, { x: pool.x, y: pool.y, width: Math.round(width), height: pool.height })
  this.syncLanesWidth(pool)
}

/**
 * Sincroniza el ancho de los lanes con el del pool. En Bizagi (y en BPMN) los
 * lanes son del POOL, no de las fases: abarcan todo el ancho del pool, todas las
 * fases. bpmn-js NO re-escala los lanes cuando el participant se redimensiona por
 * código (eso solo ocurre vía resizeLane/handles), así que lo hacemos explícito:
 * el borde derecho de cada lane = borde derecho del pool. Funciona para lanes
 * anidados (cada uno por su propia x) y para crecer o encoger.
 */
PhaseModule.prototype.syncLanesWidth = function (pool: AnyObj): void {
  const right = pool.x + pool.width
  this._registry.forEach((el: AnyObj) => {
    if (!isLane(el) || !within(pool, centerX(el), centerY(el))) return
    const newW = Math.round(right - el.x)
    if (Number.isFinite(newW) && newW > 0 && el.width !== newW) {
      this._modeling.resizeShape(el, { x: el.x, y: el.y, width: newW, height: el.height })
    }
  })
}

/** Fuerza el re-render de todas las fases del pool. Necesario cuando cambia
 *  CUÁL es la última (al añadir/borrar/reordenar): la que deja de ser última
 *  necesita su divisor punteado aunque su geometría no haya cambiado. */
PhaseModule.prototype.refreshPhases = function (pool: AnyObj): void {
  const eb = this._eventBus
  if (!eb) return
  this.getPhases(pool).forEach((p: AnyObj) => eb.fire('element.changed', { element: p }))
  // Re-render del pool: su chevron derecho aparece/desaparece según tenga fases.
  if (pool) eb.fire('element.changed', { element: pool })
}

/** Guarda los bounds actuales de cada fase del pool (para delta de resize y para
 *  revertir un movimiento inválido fuera del pool). */
PhaseModule.prototype.snapshot = function (pool: AnyObj): void {
  this._snap.clear()
  this.getPhases(pool).forEach((p: AnyObj) => {
    this._snap.set(p.id, { x: p.x, y: p.y, w: p.width, h: p.height })
  })
}

/** Devuelve una fase a su último estado válido (cuando se arrastró fuera del pool). */
PhaseModule.prototype.revertPhase = function (phase: AnyObj): void {
  const prev = this._snap.get(phase.id)
  if (!prev) { this.deferRemove([phase]); return } // sin estado previo → no puede quedar suelta
  this._busy = true
  try {
    this._modeling.resizeShape(phase, { x: prev.x, y: prev.y, width: prev.w, height: prev.h })
  } finally { this._busy = false }
}

/** Elimina fases de forma diferida (fuera del comando en curso, p. ej. una
 *  creación fuera del pool o el borrado del pool que las contiene). */
PhaseModule.prototype.deferRemove = function (shapes: AnyObj[]): void {
  const modeling = this._modeling
  const registry = this._registry
  setTimeout(() => {
    for (const s of shapes) {
      try { if (registry.get(s.id)) modeling.removeShape(s) } catch { /* ya eliminado */ }
    }
  }, 0)
}

const Module = {
  __init__: ['phaseModule'],
  phaseModule: ['type', PhaseModule],
}

export default Module
