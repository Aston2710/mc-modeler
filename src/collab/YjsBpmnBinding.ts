import type * as Y from 'yjs'
import {
  elementToSnapshot,
  isSyncable,
  snapshotsEqual,
  type ElementSnapshot,
} from './yBpmnModel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** Origen usado por Yjs cuando el transporte aplica updates remotos. */
export const REMOTE_ORIGIN = Symbol('remote')

const SYNC_DEBOUNCE_MS = 120

/**
 * Binding bidireccional bpmn-js ⇄ Y.Doc.
 *  - Y.Map('elements'): id → snapshot (LWW por elemento).
 *  - Local → Y: en commandStack.changed, recalcula y escribe diffs.
 *  - Y → Local: observa el Y.Map; aplica cambios remotos vía modeling API,
 *    suprimiendo la re-emisión local (guard de origen + flag suppress).
 */
export class YjsBpmnBinding {
  private modeler: Any
  private doc: Y.Doc
  private ymap: Y.Map<ElementSnapshot>
  private origin = Symbol('local-binding')
  private suppress = false
  private last = new Map<string, ElementSnapshot>()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private onCommandStackChanged = () => this.scheduleLocalSync()
  private observer: ((events: Y.YMapEvent<ElementSnapshot>, tx: Y.Transaction) => void) | null = null

  constructor(modeler: Any, doc: Y.Doc) {
    this.modeler = modeler
    this.doc = doc
    this.ymap = doc.getMap('elements')
  }

  start(): void {
    const empty = this.ymap.size === 0
    if (empty) {
      // Primer cliente: sembrar el doc desde el canvas ya importado.
      this.seedFromCanvas()
    } else {
      // Late-joiner: reconciliar el canvas hacia el estado del doc.
      this.reconcileCanvasToDoc()
    }

    this.modeler.get('eventBus').on('commandStack.changed', this.onCommandStackChanged)

    this.observer = (event, tx) => {
      if (tx.origin === this.origin) return // cambio propio, el canvas ya lo refleja
      this.applyRemote(event)
    }
    this.ymap.observe(this.observer)
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    try {
      this.modeler.get('eventBus').off('commandStack.changed', this.onCommandStackChanged)
    } catch { /* modeler ya destruido */ }
    if (this.observer) this.ymap.unobserve(this.observer)
    this.observer = null
  }

  // ── Local → Y ────────────────────────────────────────────────
  private scheduleLocalSync() {
    if (this.suppress) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.syncLocalToY(), SYNC_DEBOUNCE_MS)
  }

  private currentSnapshots(): Map<string, ElementSnapshot> {
    const registry = this.modeler.get('elementRegistry')
    const map = new Map<string, ElementSnapshot>()
    registry.getAll().forEach((el: Any) => {
      if (isSyncable(el)) map.set(el.id, elementToSnapshot(el))
    })
    return map
  }

  private seedFromCanvas() {
    const current = this.currentSnapshots()
    this.doc.transact(() => {
      current.forEach((snap, id) => this.ymap.set(id, snap))
    }, this.origin)
    this.last = current
  }

  private syncLocalToY() {
    const current = this.currentSnapshots()
    this.doc.transact(() => {
      // altas y cambios
      current.forEach((snap, id) => {
        const prev = this.last.get(id)
        if (!prev || !snapshotsEqual(prev, snap)) this.ymap.set(id, snap)
      })
      // bajas
      this.last.forEach((_snap, id) => {
        if (!current.has(id)) this.ymap.delete(id)
      })
    }, this.origin)
    this.last = current
  }

  // ── Y → Local ────────────────────────────────────────────────
  private applyRemote(event: Y.YMapEvent<ElementSnapshot>) {
    const registry = this.modeler.get('elementRegistry')
    const adds: ElementSnapshot[] = []
    const updates: ElementSnapshot[] = []
    const removes: string[] = []

    event.changes.keys.forEach((change, key) => {
      if (change.action === 'delete') {
        removes.push(key)
      } else {
        const snap = this.ymap.get(key)
        if (!snap) return
        if (registry.get(key)) updates.push(snap)
        else adds.push(snap)
      }
    })

    this.suppress = true
    try {
      // Orden: shapes nuevas → conexiones nuevas → updates → bajas.
      adds.filter((s) => !isConnectionSnap(s)).forEach((s) => this.createShape(s))
      adds.filter((s) => isConnectionSnap(s)).forEach((s) => this.createConnection(s))
      updates.forEach((s) => this.updateElement(s))
      removes.forEach((id) => this.removeElement(id))
    } finally {
      this.suppress = false
      // Mantener 'last' alineado para no re-emitir lo que acabamos de aplicar.
      this.last = this.currentSnapshots()
    }
  }

  private createShape(snap: ElementSnapshot) {
    try {
      const m = this.modeler
      const registry = m.get('elementRegistry')
      if (registry.get(snap.id)) return
      const parent = (snap.parent && registry.get(snap.parent)) || m.get('canvas').getRootElement()
      const bpmnFactory = m.get('bpmnFactory')
      const boAttrs: Any = {}
      if (snap.name != null) boAttrs.name = snap.name
      let businessObject: Any
      if (snap.eventDefinition) {
        const def = bpmnFactory.create(snap.eventDefinition)
        businessObject = bpmnFactory.create(snap.type, { ...boAttrs, eventDefinitions: [def] })
        def.$parent = businessObject
      } else {
        businessObject = bpmnFactory.create(snap.type, boAttrs)
      }
      const width = snap.width ?? 100
      const height = snap.height ?? 80
      const shape = m.get('elementFactory').createShape({ id: snap.id, type: snap.type, businessObject, width, height })
      const cx = (snap.x ?? 0) + width / 2
      const cy = (snap.y ?? 0) + height / 2
      m.get('modeling').createShape(shape, { x: cx, y: cy }, parent)
    } catch (e) {
      console.warn('[collab] createShape falló', snap.id, e)
    }
  }

  private createConnection(snap: ElementSnapshot) {
    try {
      const m = this.modeler
      const registry = m.get('elementRegistry')
      if (registry.get(snap.id)) return
      const source = snap.source && registry.get(snap.source)
      const target = snap.target && registry.get(snap.target)
      if (!source || !target) return // sus nodos aún no existen; se reintentará en el próximo update
      const parent = (snap.parent && registry.get(snap.parent)) || source.parent
      m.get('modeling').createConnection(source, target, { id: snap.id, type: snap.type }, parent)
      if (snap.waypoints && snap.waypoints.length >= 2) {
        const conn = registry.get(snap.id)
        if (conn) m.get('modeling').updateWaypoints(conn, snap.waypoints)
      }
    } catch (e) {
      console.warn('[collab] createConnection falló', snap.id, e)
    }
  }

  private updateElement(snap: ElementSnapshot) {
    try {
      const m = this.modeler
      const el = m.get('elementRegistry').get(snap.id)
      if (!el) return this.createShapeOrConnection(snap)
      const modeling = m.get('modeling')

      if (isConnectionSnap(snap)) {
        if (snap.waypoints && snap.waypoints.length >= 2) {
          modeling.updateWaypoints(el, snap.waypoints.map((w) => ({ ...w })))
        }
      } else {
        // mover / redimensionar
        const dx = (snap.x ?? el.x) - el.x
        const dy = (snap.y ?? el.y) - el.y
        const sizeChanged = (snap.width != null && snap.width !== el.width) || (snap.height != null && snap.height !== el.height)
        if (sizeChanged) {
          modeling.resizeShape(el, { x: snap.x ?? el.x, y: snap.y ?? el.y, width: snap.width ?? el.width, height: snap.height ?? el.height })
        } else if (dx !== 0 || dy !== 0) {
          modeling.moveElements([el], { x: dx, y: dy })
        }
      }
      // nombre
      if (snap.name != null && el.businessObject?.name !== snap.name) {
        modeling.updateProperties(el, { name: snap.name })
      }
    } catch (e) {
      console.warn('[collab] updateElement falló', snap.id, e)
    }
  }

  private createShapeOrConnection(snap: ElementSnapshot) {
    if (isConnectionSnap(snap)) this.createConnection(snap)
    else this.createShape(snap)
  }

  private removeElement(id: string) {
    try {
      const el = this.modeler.get('elementRegistry').get(id)
      if (el) this.modeler.get('modeling').removeElements([el])
    } catch (e) {
      console.warn('[collab] removeElement falló', id, e)
    }
  }

  private reconcileCanvasToDoc() {
    const current = this.currentSnapshots()
    const adds: ElementSnapshot[] = []
    const updates: ElementSnapshot[] = []
    this.ymap.forEach((snap, id) => {
      if (!current.has(id)) adds.push(snap)
      else if (!snapshotsEqual(current.get(id)!, snap)) updates.push(snap)
    })
    const removes: string[] = []
    current.forEach((_s, id) => { if (!this.ymap.has(id)) removes.push(id) })

    this.suppress = true
    try {
      adds.filter((s) => !isConnectionSnap(s)).forEach((s) => this.createShape(s))
      adds.filter((s) => isConnectionSnap(s)).forEach((s) => this.createConnection(s))
      updates.forEach((s) => this.updateElement(s))
      removes.forEach((id) => this.removeElement(id))
    } finally {
      this.suppress = false
      this.last = this.currentSnapshots()
    }
  }
}

function isConnectionSnap(snap: ElementSnapshot): boolean {
  return snap.source !== undefined || snap.target !== undefined || snap.waypoints !== undefined
}
