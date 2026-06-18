/**
 * PhaseLabelEditingModule.ts — renombrar una Fase con doble-clic (edición inline).
 *
 * Dos piezas:
 *  1) labelEditingProvider: al editar una Fase, el editor muestra el nombre ACTUAL
 *     (flujo:phaseName) sobre la banda del nombre, y al confirmar lo escribe en
 *     flujo:phaseName (+ name) vía modeling (undoable, re-render, persiste).
 *  2) interactionEvents: `bpmn:Group` es un FRAME → diagram-js solo le da hit en el
 *     borde (para poder clickear "a través" sobre las tareas). Eso impide el
 *     doble-clic sobre el nombre. Añadimos un hit `'all'` sobre el HEADER (banda
 *     superior del nombre) para que el nombre sea clickeable/dobleclickeable, sin
 *     bloquear el cuerpo (las tareas siguen accesibles).
 */

import { isPhase, getPhaseName } from './phaseUtil'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const HEADER = 30 // alto de la banda del nombre (= PHASE_HEADER del renderer)
const HEADER_HIT_CLASS = 'phase-header-hit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PhaseLabelEditing(this: any, labelEditingProvider: any, modeling: any, interactionEvents: any, canvas: any, eventBus: any, elementRegistry: any) {
  // ── 0) Ocultar el nombre renderizado mientras se edita (evita verlo doble) ──
  let editingPhase: AnyObj = null
  const setNameVisible = (element: AnyObj, visible: boolean) => {
    const gfx = elementRegistry.getGraphics?.(element)
    const label = gfx?.querySelector?.('.djs-phase-name')
    if (label) label.style.display = visible ? '' : 'none'
  }
  if (eventBus) {
    eventBus.on('directEditing.activate', (e: AnyObj) => {
      const el = e?.active?.element
      if (el && isPhase(el)) { editingPhase = el; setNameVisible(el, false) }
    })
    eventBus.on(['directEditing.complete', 'directEditing.cancel'], () => {
      if (editingPhase) {
        const prev = editingPhase
        editingPhase = null
        // Re-render: restaura el nombre (con el valor nuevo si se confirmó).
        eventBus.fire('element.changed', { element: prev })
      }
    })
  }

  // ── 1) Editor: mostrar/guardar flujo:phaseName ──────────────────────────────
  if (labelEditingProvider) {
    const origActivate = labelEditingProvider.activate?.bind(labelEditingProvider)
    if (origActivate) {
      labelEditingProvider.activate = function (element: AnyObj) {
        if (isPhase(element)) {
          // bpmn-js posiciona el editor en coordenadas de PANTALLA (getAbsoluteBBox),
          // no de diagrama. Convertimos la banda del nombre (header) a pantalla.
          const box = canvas.getAbsoluteBBox({ x: element.x, y: element.y, width: element.width, height: HEADER })
          const zoom = canvas.zoom?.() ?? 1
          return {
            text: getPhaseName(element) || '',
            bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
            style: {
              fontSize: (12 * zoom) + 'px',
              fontWeight: '700',
              textAlign: 'center',
            },
            options: { autoResize: false },
          }
        }
        return origActivate(element)
      }
    }
    const origUpdate = labelEditingProvider.update?.bind(labelEditingProvider)
    if (origUpdate) {
      labelEditingProvider.update = function (element: AnyObj, newLabel: string, ...rest: AnyObj[]) {
        if (isPhase(element)) {
          const value = (newLabel ?? '').trim()
          modeling.updateProperties(element, { phaseName: value || undefined, name: value || undefined })
          return
        }
        return origUpdate(element, newLabel, ...rest)
      }
    }
  }

  // ── 2) Hit del header (hacer el nombre clickeable) ──────────────────────────
  if (interactionEvents) {
    const addHeaderHit = (element: AnyObj, gfx: AnyObj) => {
      if (!isPhase(element) || !gfx) return
      try {
        const prev = gfx.querySelector?.('.' + HEADER_HIT_CLASS)
        if (prev) prev.remove()
        const hit = interactionEvents.createBoxHit(gfx, 'all', {
          x: 0, y: 0,
          width: Math.max(1, element.width || 1),
          height: HEADER,
        })
        hit?.classList?.add(HEADER_HIT_CLASS)
      } catch { /* no romper el render si la API cambia */ }
    }

    const origCreate = interactionEvents.createDefaultHit?.bind(interactionEvents)
    if (origCreate) {
      interactionEvents.createDefaultHit = function (element: AnyObj, gfx: AnyObj) {
        const r = origCreate(element, gfx)
        addHeaderHit(element, gfx)
        return r
      }
    }
    const origUpdateHit = interactionEvents.updateDefaultHit?.bind(interactionEvents)
    if (origUpdateHit) {
      interactionEvents.updateDefaultHit = function (element: AnyObj, gfx: AnyObj) {
        const r = origUpdateHit(element, gfx)
        addHeaderHit(element, gfx)
        return r
      }
    }
  }
}
PhaseLabelEditing.$inject = ['labelEditingProvider', 'modeling', 'interactionEvents', 'canvas', 'eventBus', 'elementRegistry']

const Module = {
  __init__: ['phaseLabelEditing'],
  phaseLabelEditing: ['type', PhaseLabelEditing],
}

export default Module
