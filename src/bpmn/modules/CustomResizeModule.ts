/**
 * CustomResizeModule.ts (v4 — outline fix incluido)
 *
 * PROBLEMA 1 (resuelto en v3):
 *   BpmnRules.canResize() devuelve false para Task/Event/Gateway.
 *   Fix: RuleProvider.addRule('shape.resize', priority=2000) que devuelve true
 *   antes que BpmnRules (priority=1000).
 *
 * PROBLEMA 2 (resuelto en v4 — silueta fantasma):
 *   OutlineProvider de bpmn-js crea el outline SVG una sola vez en shape.added:
 *     - Events  → <circle cx cy r>
 *     - Gateways → <rect> rotado 45deg
 *   Al hacer resize, Outline.updateShapeOutline() intenta delegar a providers,
 *   pero OutlineProvider NO implementa updateOutline() → cae al fallback genérico
 *   que aplica {x, y, width, height} a un <circle> (atributos inválidos en SVG).
 *   Resultado: el outline queda con las dimensiones originales → silueta fantasma.
 *   Fix: listener en shape.changed que parchea directamente los atributos SVG
 *   del outline según el tipo de elemento.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — diagram-js ships CommonJS without full types
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// ── Constantes ─────────────────────────────────────────────────────────────
const OUTLINE_OFFSET = 5   // mismo valor que OutlineProvider de bpmn-js
const END_EVENT_EXTRA = 1  // bpmn-js añade 1px extra para el stroke del EndEvent

const MIN_SIZE: Array<{ type: string; width: number; height: number }> = [
  { type: 'bpmn:Task',    width: 50, height: 30 },
  { type: 'bpmn:Gateway', width: 30, height: 30 },
  { type: 'bpmn:Event',   width: 28, height: 28 },
]

// ── Helpers de tipo ─────────────────────────────────────────────────────────
function isEvent(element: AnyObj): boolean {
  const bo = element?.businessObject
  return !!bo?.$instanceOf?.('bpmn:Event')
}

function isEndEvent(element: AnyObj): boolean {
  const bo = element?.businessObject
  return !!bo?.$instanceOf?.('bpmn:EndEvent')
}

function isGateway(element: AnyObj): boolean {
  const bo = element?.businessObject
  return !!bo?.$instanceOf?.('bpmn:Gateway')
}

/**
 * Tipos que bpmn-js bloquea para resize y que queremos habilitar.
 * No incluimos SubProcess/Participant/Lane: bpmn-js ya los maneja.
 */
function shouldOverride(element: AnyObj): boolean {
  if (!element || element.waypoints || element.labelTarget) return false
  const bo = element?.businessObject
  if (!bo?.$instanceOf) return false
  if (
    bo.$instanceOf('bpmn:SubProcess') ||
    bo.$instanceOf('bpmn:Participant') ||
    bo.$instanceOf('bpmn:Lane') ||
    bo.$instanceOf('bpmn:Process') ||
    bo.$instanceOf('bpmn:Collaboration')
  ) return false
  return (
    bo.$instanceOf('bpmn:Task')         ||
    bo.$instanceOf('bpmn:Event')        ||
    bo.$instanceOf('bpmn:Gateway')      ||
    bo.$instanceOf('bpmn:CallActivity') ||
    bo.$instanceOf('bpmn:DataObject')   ||
    bo.$instanceOf('bpmn:DataStore')
  )
}

function getMinSize(element: AnyObj): { width: number; height: number } {
  const bo = element?.businessObject
  if (!bo?.$instanceOf) return { width: 30, height: 30 }
  for (const entry of MIN_SIZE) {
    if (bo.$instanceOf(entry.type)) return entry
  }
  return { width: 30, height: 30 }
}

// ── CustomResizeRules — extiende RuleProvider (API oficial de diagram-js) ──
function CustomResizeRules(eventBus: AnyObj) {
  RuleProvider.call(this, eventBus)
}

inherits(CustomResizeRules, RuleProvider)

CustomResizeRules.$inject = ['eventBus']

CustomResizeRules.prototype.init = function () {
  // Prioridad 2000 > 1000 de BpmnRules → esta regla se evalúa primero
  this.addRule('shape.resize', 2000, function (context: AnyObj) {
    const { shape, newBounds } = context

    if (!shouldOverride(shape)) return undefined  // pasar a BpmnRules

    if (newBounds) {
      const min = getMinSize(shape)
      if (newBounds.width < min.width || newBounds.height < min.height) return false
    }

    return true
  })
}

// ── OutlineFixer — corrige la silueta fantasma tras resize ─────────────────
function OutlineFixer(eventBus: AnyObj) {
  eventBus.on('shape.changed', function (event: AnyObj) {
    const { element, gfx } = event
    if (!gfx || !shouldOverride(element)) return

    // El outline es el primer elemento con clase .djs-outline dentro del gfx
    const outline: SVGElement | null = gfx.querySelector('.djs-outline')
    if (!outline) return

    if (isEvent(element)) {
      // El outline de Events es un <circle>. El fallback de Outline.js aplica
      // {x,y,width,height} que no afectan a círculos → corregir cx, cy, r
      const extra = isEndEvent(element) ? END_EVENT_EXTRA : 0
      const r = element.width / 2 + OUTLINE_OFFSET + extra
      outline.setAttribute('cx', String(element.width / 2))
      outline.setAttribute('cy', String(element.height / 2))
      outline.setAttribute('r',  String(r))
    } else if (isGateway(element)) {
      // El outline de Gateways es un <rect> rotado 45°.
      // El fallback aplica x,y,width,height — pero con valores incorrectos.
      // Aplicamos los mismos valores que OutlineProvider usa en getOutline().
      outline.setAttribute('x',      '2')
      outline.setAttribute('y',      '2')
      outline.setAttribute('width',  String(element.width  - 4))
      outline.setAttribute('height', String(element.height - 4))
    }
  })
}

OutlineFixer.$inject = ['eventBus']

// ── Módulo bpmn-js ──────────────────────────────────────────────────────────
const CustomResizeModule = {
  __init__: ['customResizeRules', 'outlineFixer'],
  customResizeRules: ['type', CustomResizeRules],
  outlineFixer:      ['type', OutlineFixer],
}

export default CustomResizeModule
