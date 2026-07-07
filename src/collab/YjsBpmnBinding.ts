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

const SYNC_DEBOUNCE_MS = 40

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
  private importInProgress = false
  private onCommandStackChanged = () => this.scheduleLocalSync()
  private onImportStart = () => {
    this.importInProgress = true
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
  }
  private onImportDone = () => {
    this.importInProgress = false
    this.last = this.currentSnapshots()
  }
  // Interceptor de alta prioridad para commandStack.changed durante apply remoto.
  // LabelEditingProvider (bpmn-js) escucha commandStack.changed en prioridad 1000
  // y llama directEditing.cancel() en CUALQUIER operación — incluso shapes remotos
  // no relacionados. Registrando en prioridad 5000, disparamos ANTES y si suppress=true
  // retornamos false → corta propagación → cancel() nunca llega.
  // diagram-js EventBus: retornar cualquier valor !== undefined llama stopPropagation().
  private onCommandStackChangedIntercept = (): false | void => {
    if (this.suppress) return false
  }
  private observer: ((events: Y.YMapEvent<ElementSnapshot>, tx: Y.Transaction) => void) | null = null

  constructor(modeler: Any, doc: Y.Doc) {
    this.modeler = modeler
    this.doc = doc
    this.ymap = doc.getMap('elements')
  }

  start(): void {
    // No "sembramos" el diagrama completo: todos parten del mismo current_xml
    // y el doc solo transporta los CAMBIOS. Esto evita que dos clientes
    // sembrando a la vez se pisen por LWW.
    if (this.ymap.size > 0) {
      // Ya hay cambios en el doc (persistidos o de un peer): aplicarlos al canvas.
      this.reconcileCanvasToDoc()
    } else {
      // Baseline: registrar el estado actual sin escribir nada al doc.
      this.last = this.currentSnapshots()
    }

    this.modeler.get('eventBus').on('commandStack.changed', this.onCommandStackChanged)
    // Prioridad 5000 > prioridad default 1000 de LabelEditingProvider
    this.modeler.get('eventBus').on('commandStack.changed', 5000, this.onCommandStackChangedIntercept)
    this.modeler.get('eventBus').on('import.render.start', this.onImportStart)
    this.modeler.get('eventBus').on('import.done', this.onImportDone)

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
      this.modeler.get('eventBus').off('commandStack.changed', this.onCommandStackChangedIntercept)
      this.modeler.get('eventBus').off('import.render.start', this.onImportStart)
      this.modeler.get('eventBus').off('import.done', this.onImportDone)
    } catch { /* modeler ya destruido */ }
    if (this.observer) this.ymap.unobserve(this.observer)
    this.observer = null
  }

  // ── Local → Y ────────────────────────────────────────────────
  private scheduleLocalSync() {
    if (this.suppress || this.importInProgress) {
      // Cancelar timer pendiente — su diff quedaría obsoleto porque applyRemote/import
      // va a avanzar this.last. El flush se hace en applyRemote() antes de suppress=true.
      if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
      return
    }
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
    // (M2) No aplicar cambios remotos mientras el canvas está siendo re-importado.
    if (this.importInProgress) return

    // (C1) Flush de cualquier sync local pendiente ANTES de avanzar this.last.
    // Sin esto, el debounce timer pendiente expira después de que this.last ya fue
    // actualizado y encuentra diff vacío → el cambio local se pierde silenciosamente.
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      this.syncLocalToY()
    }

    // (C2) El interceptor onCommandStackChangedIntercept (prioridad 5000) bloquea
    // la propagación de commandStack.changed mientras suppress=true, evitando que
    // LabelEditingProvider.js:104 llame directEditing.cancel() por ops remotas.
    // El usuario puede seguir tipeando sin interrupción aunque lleguen cambios de otros peers.

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
      // Orden: shapes nuevas → conexiones nuevas → updates (shapes primero,
      // conexiones después) → bajas. El orden de los updates importa: si los
      // waypoints de una flecha se aplican ANTES que el movimiento de su shape,
      // el layouter local recalcula la flecha al mover el shape y queda distinta
      // a la del emisor (drift de píxeles entre colaboradores).
      orderShapeAdds(adds.filter((s) => !isConnectionSnap(s))).forEach((s) => this.createShape(s))
      adds.filter((s) => isConnectionSnap(s)).forEach((s) => this.createConnection(s))
      orderShapeAdds(updates.filter((s) => !isConnectionSnap(s))).forEach((s) => this.updateElement(s))
      updates.filter((s) => isConnectionSnap(s)).forEach((s) => this.updateElement(s))
      removes.forEach((id) => this.removeElement(id))
      // Pasada correctiva: aplicar vía modeling API tiene side-effects (el
      // layouter/docking recalcula conexiones al mover shapes) que pueden dejar
      // el canvas en valores distintos a los snapshots recibidos. Re-aplicar
      // una vez los que quedaron desviados — idempotente y exacto.
      this.correctivePass([...adds, ...updates])
    } finally {
      this.suppress = false
      // Mantener 'last' alineado para no re-emitir lo que acabamos de aplicar.
      this.last = this.currentSnapshots()
    }
  }

  /** Re-aplica los snapshots cuyo estado en canvas quedó desviado tras la
   *  primera aplicación (side-effects del layouter). Una sola iteración:
   *  reduce el drift a ~0 sin arriesgar bucles con los hooks de layout. */
  private correctivePass(snaps: ElementSnapshot[]) {
    const registry = this.modeler.get('elementRegistry')
    snaps.forEach((snap) => {
      try {
        const el = registry.get(snap.id)
        if (!el || !isSyncable(el)) return
        if (!snapshotsEqual(elementToSnapshot(el), snap)) this.updateElement(snap)
      } catch { /* best-effort */ }
    })
  }

  private createShape(snap: ElementSnapshot) {
    try {
      const m = this.modeler
      const registry = m.get('elementRegistry')
      if (registry.get(snap.id)) return
      // CANDADO anti-superposición (defensa estructural): resolver el parent de
      // forma estricta. Si el snapshot declara un parent que NO existe en este
      // diagrama (p. ej. una raíz Collab_* de OTRO diagrama), el elemento es
      // ajeno → NO se crea. Antes se caía a la raíz del canvas, lo que dibujaba
      // pools de otros diagramas encima (contaminación). Ver resolveParentOrSkip.
      const canvasRoot = m.get('canvas').getRootElement()
      // ¿El canvas ya tiene alguna pool propia? Si la tiene, un elemento con parent
      // ajeno no resoluble es contaminación de OTRO diagrama y se descarta. Si NO
      // tiene ninguna pool (XML solo-proceso), la pool con parent no resoluble es la
      // PROPIA del diagrama (vive en Yjs) y debe crearse bajo la raíz.
      const canvasHasParticipants = registry.filter((el: Any) => el.type === 'bpmn:Participant').length > 0
      const parent = resolveParentOrSkip(snap.parent, registry, canvasRoot, canvasHasParticipants)
      if (parent === null) {
        console.warn('[collab] elemento descartado: pool/elemento ajeno (parent no resoluble con pools ya presentes)', snap.id, 'parent=', snap.parent)
        return
      }
      const bpmnFactory = m.get('bpmnFactory')
      const boAttrs: Any = {}
      if (snap.name != null) boAttrs.name = snap.name
      if (snap.text != null) boAttrs.text = snap.text
      if (snap.linkedDiagram != null) boAttrs['flujo:linkedDiagram'] = snap.linkedDiagram
      if (snap.phaseName != null) { boAttrs['flujo:phaseName'] = snap.phaseName; boAttrs.name = snap.phaseName }
      let businessObject: Any
      if (snap.eventDefinition) {
        const def = bpmnFactory.create(snap.eventDefinition)
        businessObject = bpmnFactory.create(snap.type, { ...boAttrs, eventDefinitions: [def] })
        def.$parent = businessObject
      } else {
        businessObject = bpmnFactory.create(snap.type, boAttrs)
      }
      // Preservar el id semántico (necesario p. ej. para reconocer Fases 'Phase_*'
      // al recargar el XML; sin esto bpmn-js asignaría un id automático al bo).
      businessObject.id = snap.id
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
      const conn = registry.get(snap.id)
      if (conn && snap.manualRoute) {
        conn.businessObject?.set?.('flujo:manualRoute', true)
      }
      if (snap.waypoints && snap.waypoints.length >= 2 && conn) {
        m.get('modeling').updateWaypoints(conn, snap.waypoints)
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
        const curManual = !!(el.businessObject?.get?.('flujo:manualRoute') ?? el.businessObject?.manualRoute)
        if (!!snap.manualRoute !== curManual) {
          el.businessObject?.set?.('flujo:manualRoute', snap.manualRoute ? true : undefined)
        }
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
      // (M1) nombre y texto: omitir si el usuario está editando activamente este elemento.
      // modeling.updateProperties() durante directEditing cancela la edición en curso.
      let beingEdited = false
      try {
        const de = this.modeler.get('directEditing')
        if (de?.isActive()) {
          const activeEl = de.getActive()?.element
          beingEdited = activeEl?.id === snap.id || activeEl?.id === (el as Any).label?.id
        }
      } catch { /* noop */ }
      if (!beingEdited && snap.name != null && el.businessObject?.name !== snap.name) {
        modeling.updateProperties(el, { name: snap.name })
      }
      // texto (TextAnnotation / imágenes embebidas)
      if (!beingEdited && snap.text != null && el.businessObject?.text !== snap.text) {
        modeling.updateProperties(el, { text: snap.text })
      }
      // enlace de subproceso
      const curLink = el.businessObject?.get?.('flujo:linkedDiagram') ?? el.businessObject?.linkedDiagram
      if ((snap.linkedDiagram ?? null) !== (curLink ?? null)) {
        modeling.updateProperties(el, { 'flujo:linkedDiagram': snap.linkedDiagram ?? undefined })
      }
      // nombre de fase (persistente en flujo:phaseName)
      const curPhase = el.businessObject?.get?.('flujo:phaseName') ?? el.businessObject?.phaseName
      if ((snap.phaseName ?? null) !== (curPhase ?? null)) {
        modeling.updateProperties(el, { 'flujo:phaseName': snap.phaseName ?? undefined, name: snap.phaseName ?? undefined })
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
      if (!el) return
      // (C3) Cancelar directEditing sobre este elemento antes de removeElements().
      // bpmn-js #1664: llamar removeElements() mientras directEditing está activo
      // dispara element.updateLabel dentro de execute/revert → corrupción del CommandStack.
      try {
        const de = this.modeler.get('directEditing')
        if (de?.isActive()) {
          const activeEl = de.getActive()?.element
          if (activeEl?.id === id || activeEl?.id === (el as Any).label?.id)
            de.cancel()
        }
      } catch { /* noop */ }
      this.modeler.get('modeling').removeElements([el])
    } catch (e) {
      console.warn('[collab] removeElement falló', id, e)
    }
  }

  /**
   * Re-sincronización periódica canvas↔doc (anti-entropía local): repara
   * aplicaciones al canvas que fallaron o se desviaron (conexión cuyo nodo aún
   * no existía, drift del layouter, mensajes cuyo apply se saltó) re-aplicando
   * lo que el doc ya sabe. Segura de llamar en cualquier momento: no borra por
   * ausencia y no re-emite (suppress).
   */
  resync(): void {
    if (this.importInProgress || this.suppress) return
    // Flush del sync local pendiente ANTES (mismo motivo que C1 en applyRemote).
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      this.syncLocalToY()
    }
    this.reconcileCanvasToDoc()
  }

  private reconcileCanvasToDoc() {
    // El Y.Doc transporta solo CAMBIOS (diffs), NO el diagrama completo. Por eso
    // al reconciliar SOLO se añaden/actualizan elementos: un elemento ausente del
    // doc puede significar "nunca se editó" (la mayoría) o "se borró" — son
    // indistinguibles aquí. Borrar por ausencia eliminaría todo el diagrama
    // importado/cargado (pérdida de datos). Las eliminaciones reales llegan en
    // vivo por applyRemote (change.action === 'delete').
    const current = this.currentSnapshots()
    const adds: ElementSnapshot[] = []
    const updates: ElementSnapshot[] = []
    this.ymap.forEach((snap, id) => {
      if (!current.has(id)) adds.push(snap)
      else if (!snapshotsEqual(current.get(id)!, snap)) updates.push(snap)
    })
    // (C4) Elementos en canvas pero ausentes del Y.Doc → publicarlos al doc.
    // "Ausente del Y.Map" en reconciliación inicial ≠ "borrado remotamente";
    // puede ser trabajo offline que el Y.Doc aún no conoce. Borrar sería pérdida de datos.
    this.doc.transact(() => {
      current.forEach((snap, id) => {
        if (!this.ymap.has(id)) this.ymap.set(id, snap)
      })
    }, this.origin)

    this.suppress = true
    try {
      orderShapeAdds(adds.filter((s) => !isConnectionSnap(s))).forEach((s) => this.createShape(s))
      adds.filter((s) => isConnectionSnap(s)).forEach((s) => this.createConnection(s))
      orderShapeAdds(updates.filter((s) => !isConnectionSnap(s))).forEach((s) => this.updateElement(s))
      updates.filter((s) => isConnectionSnap(s)).forEach((s) => this.updateElement(s))
      this.correctivePass([...adds, ...updates])
    } finally {
      this.suppress = false
      this.last = this.currentSnapshots()
    }
  }
}

function isConnectionSnap(snap: ElementSnapshot): boolean {
  return snap.source !== undefined || snap.target !== undefined || snap.waypoints !== undefined
}

/** Registro mínimo que necesita resolveParentOrSkip (subconjunto de elementRegistry). */
interface RegistryLike { get(id: string): unknown }
/** Elemento raíz mínimo (tiene id). */
interface RootLike { id: string }

/**
 * Resuelve el parent con el que crear una shape, o devuelve null si el elemento
 * es AJENO a este diagrama y no debe crearse.
 *
 * Reglas:
 *  - Sin parent declarado → raíz del canvas (comportamiento normal).
 *  - Parent que existe en el registro → ese elemento.
 *  - Parent === id de la raíz actual (aunque el registro no lo devuelva) → raíz.
 *  - Parent declarado pero NO resoluble:
 *      · si el canvas YA tiene pools → null (DESCARTAR): es contaminación de otro
 *        diagrama (una pool extra con su propia raíz Collab_XXX inexistente aquí).
 *      · si el canvas NO tiene pools → raíz: es la pool propia del diagrama, que
 *        vive en Yjs porque el current_xml es solo-proceso (patrón legítimo).
 *
 * El caso "descartar" es el candado que evita "un diagrama sobre otro" sin romper
 * los diagramas cuya única pool vive en la capa Yjs (XML sin <participant>).
 */
export function resolveParentOrSkip(
  snapParent: string | null | undefined,
  registry: RegistryLike,
  canvasRoot: RootLike | null | undefined,
  canvasHasParticipants = false
): unknown | null {
  if (!snapParent) return canvasRoot ?? null
  const p = registry.get(snapParent)
  if (p) return p
  if (canvasRoot && snapParent === canvasRoot.id) return canvasRoot
  // parent declarado pero no resoluble → depende de si ya hay pools propias:
  if (canvasHasParticipants) return null   // contaminación: pool ajena extra
  return canvasRoot ?? null                 // pool propia (XML solo-proceso) → permitir
}

/**
 * Ordena shapes para creación: contenedores primero (Participant → Lane → resto),
 * para que al reconciliar un lote con dependencias intra-lote, el padre exista
 * antes que sus hijos (evita que un hijo legítimo se descarte por orden).
 */
export function orderShapeAdds(snaps: ElementSnapshot[]): ElementSnapshot[] {
  const rank = (t: string) => (t === 'bpmn:Participant' ? 0 : t === 'bpmn:Lane' ? 1 : 2)
  return [...snaps].sort((a, b) => rank(a.type) - rank(b.type))
}
