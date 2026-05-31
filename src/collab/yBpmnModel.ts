/**
 * Modelo CRDT del diagrama: cada elemento bpmn-js se representa como un
 * "snapshot" plano dentro de un Y.Map keyed por id de elemento.
 * El binding (YjsBpmnBinding) sincroniza ambos lados.
 */

export interface Waypoint {
  x: number
  y: number
}

export interface ElementSnapshot {
  id: string
  type: string // p.ej. 'bpmn:Task', 'bpmn:SequenceFlow'
  parent: string | null
  // Shapes
  x?: number
  y?: number
  width?: number
  height?: number
  // Connections
  source?: string | null
  target?: string | null
  waypoints?: Waypoint[]
  manualRoute?: boolean // conexión con ruta editada manualmente
  // businessObject
  name?: string
  text?: string // bpmn:TextAnnotation (incluye imágenes embebidas '[IMAGE:...]')
  eventDefinition?: string | null
  linkedDiagram?: string | null // bpmn:SubProcess → id del diagrama enlazado
  phaseName?: string | null // Fase (bpmn:Group Phase_*) → nombre persistente
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any

const SKIP_TYPES = new Set(['label'])

/** ¿Debe sincronizarse este elemento? (excluye raíz, labels y elementos sin tipo bpmn) */
export function isSyncable(el: AnyEl): boolean {
  if (!el || !el.id || !el.type) return false
  if (SKIP_TYPES.has(el.type)) return false
  if (el.type === 'bpmn:Process' || el.type === 'bpmn:Collaboration') return false
  // raíz del canvas (sin parent) no se sincroniza
  if (!el.parent) return false
  return true
}

export function isConnection(el: AnyEl): boolean {
  return Array.isArray(el?.waypoints)
}

/** Lee un elemento del modeler a snapshot plano. */
export function elementToSnapshot(el: AnyEl): ElementSnapshot {
  const bo = el.businessObject ?? {}
  const snap: ElementSnapshot = {
    id: el.id,
    type: el.type,
    parent: el.parent?.id ?? null,
    name: bo.name ?? undefined,
  }
  if (bo.text != null) snap.text = bo.text
  const linked = bo.get?.('flujo:linkedDiagram') ?? bo.linkedDiagram
  if (linked) snap.linkedDiagram = String(linked)
  const phaseName = bo.get?.('flujo:phaseName') ?? bo.phaseName
  if (phaseName) snap.phaseName = String(phaseName)
  const eventDef = bo.eventDefinitions?.[0]?.$type
  if (eventDef) snap.eventDefinition = eventDef

  if (isConnection(el)) {
    snap.source = el.source?.id ?? null
    snap.target = el.target?.id ?? null
    snap.waypoints = (el.waypoints ?? []).map((w: Waypoint) => ({ x: Math.round(w.x), y: Math.round(w.y) }))
    if (bo.get?.('flujo:manualRoute') ?? bo.manualRoute) snap.manualRoute = true
  } else {
    snap.x = Math.round(el.x)
    snap.y = Math.round(el.y)
    snap.width = Math.round(el.width)
    snap.height = Math.round(el.height)
  }
  return snap
}

/** ¿Difieren dos snapshots en algo relevante? */
export function snapshotsEqual(a: ElementSnapshot, b: ElementSnapshot): boolean {
  return (
    a.type === b.type &&
    a.parent === b.parent &&
    a.name === b.name &&
    a.text === b.text &&
    a.linkedDiagram === b.linkedDiagram &&
    a.phaseName === b.phaseName &&
    a.eventDefinition === b.eventDefinition &&
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height &&
    a.source === b.source && a.target === b.target &&
    !!a.manualRoute === !!b.manualRoute &&
    JSON.stringify(a.waypoints ?? null) === JSON.stringify(b.waypoints ?? null)
  )
}

// ── Helpers base64 <-> Uint8Array (transporte de updates Yjs por broadcast) ──
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
