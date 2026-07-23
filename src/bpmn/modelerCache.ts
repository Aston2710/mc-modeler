/**
 * Cache de instancias de bpmn-js por diagrama (Fase 2 del plan de optimización).
 *
 * Motivación: hoy hay UNA instancia de bpmn-js reutilizada para todas las
 * pestañas, y cada cambio re-ejecuta `importXML` — que bloquea el hilo principal
 * (medido: 17-25s en un diagrama de 400 elementos). Manteniendo una instancia
 * VIVA por diagrama abierto y alternando con `detach`/`attachTo` (patrón de
 * Camunda Modeler), el cambio de pestaña pasa de segundos a <16ms: no se
 * re-importa, la instancia conserva su render, zoom, selección y pila de undo.
 *
 * Este módulo es PURO lifecycle: crear / adjuntar / desadjuntar / destruir, con
 * tope LRU. NO cablea listeners de la app ni colaboración — eso vive en
 * useBpmnModeler (se ejecuta una vez por instancia recién creada). Así el cache
 * queda testeable y desacoplado.
 *
 * Estado: creado y aislado. El wiring va detrás del flag `flujo:tabsCache`
 * (ver fix_doc/tab-switching-instancia-viva.md, Fase 2). Con el flag OFF el
 * cache no se usa y el comportamiento actual queda intacto.
 */

// @ts-ignore — bpmn-js es CommonJS con tipos incompletos
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { MODELER_CONFIG } from '@/bpmn/config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any

export interface ModelerEntry {
  /** Instancia bpmn-js (creada sin container; se adjunta con attachTo). */
  modeler: AnyModeler
  /** ¿Ya se importó XML en esta instancia? Evita re-importar al re-adjuntar. */
  imported: boolean
  /** Marca de uso para LRU (contador monótono, no reloj — seguro para SSR/tests). */
  lastUsed: number
}

/** Máximo de instancias vivas simultáneas. Al excederlo se destruye la LRU. */
export const DEFAULT_MAX_LIVE = 6

/**
 * Flag del cache de instancias (Fase 2).
 *
 * EN LA RAMA tabs-cache: ON por defecto para poder probar el multicanva. Se puede
 * desactivar explícitamente con `localStorage.setItem('flujo:tabsCache','0')`.
 * ANTES DE MERGEAR A MAIN: volver a OFF por defecto (=== '1') hasta cerrar el
 * checkpoint de colaboración con verificación multiusuario en nube.
 */
export function isTabsCacheEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem('flujo:tabsCache') !== '0'
}

const cache = new Map<string, ModelerEntry>()
let useCounter = 0
/** id de la instancia actualmente adjunta al DOM (para desadjuntar al cambiar). */
let attachedId: string | null = null

/** Crea una instancia bpmn-js sin container (se adjunta luego con attachTo). */
function createModeler(): AnyModeler {
  // Sin `container`: bpmn-js crea un contenedor propio desprendido; attachTo lo
  // mueve al DOM real. Misma config que la instancia única actual.
  return new BpmnModeler({ ...MODELER_CONFIG })
}

/**
 * Devuelve la entrada para `diagramId`, creándola si no existe. `isNew` indica
 * que se acaba de crear (el caller debe cablear listeners e importar XML).
 */
export function getOrCreate(
  diagramId: string,
  maxLive: number = DEFAULT_MAX_LIVE
): { entry: ModelerEntry; isNew: boolean } {
  const existing = cache.get(diagramId)
  if (existing) {
    existing.lastUsed = ++useCounter
    return { entry: existing, isNew: false }
  }
  evictIfNeeded(maxLive)
  const entry: ModelerEntry = { modeler: createModeler(), imported: false, lastUsed: ++useCounter }
  cache.set(diagramId, entry)
  return { entry, isNew: true }
}

export function get(diagramId: string): ModelerEntry | undefined {
  return cache.get(diagramId)
}

export function has(diagramId: string): boolean {
  return cache.has(diagramId)
}

export function markImported(diagramId: string): void {
  const e = cache.get(diagramId)
  if (e) e.imported = true
}

/**
 * Adjunta la instancia de `diagramId` al container dado, desadjuntando primero
 * la que estuviera visible. No-op si ya estaba adjunta a ese container.
 */
export function attach(diagramId: string, container: HTMLElement): void {
  const entry = cache.get(diagramId)
  if (!entry) return
  if (attachedId && attachedId !== diagramId) {
    const prev = cache.get(attachedId)
    try { prev?.modeler.detach() } catch { /* noop */ }
  }
  try { entry.modeler.attachTo(container) } catch { /* noop */ }
  entry.lastUsed = ++useCounter
  attachedId = diagramId
}

/** Desadjunta la instancia actualmente visible (sin destruirla). */
export function detachActive(): void {
  if (!attachedId) return
  const e = cache.get(attachedId)
  try { e?.modeler.detach() } catch { /* noop */ }
  attachedId = null
}

/** Destruye y elimina la instancia de `diagramId` (al cerrar su pestaña). */
export function dispose(diagramId: string): void {
  const e = cache.get(diagramId)
  if (!e) return
  try { e.modeler.destroy() } catch { /* noop */ }
  cache.delete(diagramId)
  if (attachedId === diagramId) attachedId = null
}

/** Destruye todas las instancias (al salir del editor / ir a home). */
export function disposeAll(): void {
  for (const [, e] of cache) {
    try { e.modeler.destroy() } catch { /* noop */ }
  }
  cache.clear()
  attachedId = null
}

export function liveCount(): number {
  return cache.size
}

/** Destruye la instancia menos usada recientemente si se excede el tope. */
function evictIfNeeded(maxLive: number): void {
  while (cache.size >= maxLive) {
    let lruId: string | null = null
    let lruUsed = Infinity
    for (const [id, e] of cache) {
      // No desalojar la que está adjunta (visible).
      if (id === attachedId) continue
      if (e.lastUsed < lruUsed) { lruUsed = e.lastUsed; lruId = id }
    }
    if (!lruId) break // solo queda la adjunta → no desalojar
    dispose(lruId)
  }
}
