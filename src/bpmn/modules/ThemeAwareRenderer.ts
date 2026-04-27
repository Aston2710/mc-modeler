/**
 * ThemeAwareRenderer.ts
 *
 * Custom renderer que extiende BpmnRenderer de bpmn-js para aplicar
 * los colores del tema activo (light/dark) a cada tipo de elemento BPMN.
 *
 * Estrategia: Priority > 1000 → se ejecuta ANTES que el renderer por defecto
 * de bpmn-js. Delegamos al renderer base pasando los colores correctos como
 * `attrs`, que bpmn-js aplica mediante getFillColor/getStrokeColor/getLabelColor.
 *
 * bpmn-js v18 pasa los attrs al método drawShape/drawConnection de los handlers,
 * los cuales llaman a getFillColor(element, defaultColor, attrs.fill).
 * Si el elemento BPMN tiene color forzado en el DI (color="#xxx"), ese valor
 * tiene prioridad. Si no, se usa attrs.fill y luego defaultFillColor.
 * Nosotros siempre ponemos los colores del tema como attrs.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — bpmn-js ships CommonJS without full types
import BpmnRenderer from 'bpmn-js/lib/draw/BpmnRenderer'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'

import {
  taskColors,
  startEventColors,
  endEventColors,
  intermediateEventColors,
  gatewayColors,
  poolColors,
  laneColors,
  connectionColors,
  defaultColors,
} from './ThemeColors'

// ──────────────────────────────────────────────────────────────
// Utilidad: ¿es un elemento de este tipo?
// ──────────────────────────────────────────────────────────────
function isType(element: AnyElement, type: string): boolean {
  const bo = element.businessObject
  if (!bo) return false
  // bo.$instanceOf está disponible en todos los business objects de bpmn-moddle
  return typeof bo.$instanceOf === 'function' && bo.$instanceOf(type)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyElement = any

// ──────────────────────────────────────────────────────────────
// Colores por tipo de elemento
// ──────────────────────────────────────────────────────────────
function getColorsFor(element: AnyElement): {
  fill: string
  stroke: string
  labelColor: string
} {
  // Tareas (todos los subtipos)
  if (
    isType(element, 'bpmn:Task') ||
    isType(element, 'bpmn:UserTask') ||
    isType(element, 'bpmn:ServiceTask') ||
    isType(element, 'bpmn:SendTask') ||
    isType(element, 'bpmn:ReceiveTask') ||
    isType(element, 'bpmn:ManualTask') ||
    isType(element, 'bpmn:ScriptTask') ||
    isType(element, 'bpmn:BusinessRuleTask') ||
    isType(element, 'bpmn:CallActivity')
  ) {
    return taskColors()
  }

  // SubProcesos
  if (isType(element, 'bpmn:SubProcess')) {
    return taskColors()
  }

  // Evento de inicio
  if (isType(element, 'bpmn:StartEvent')) {
    return startEventColors()
  }

  // Evento de fin
  if (isType(element, 'bpmn:EndEvent')) {
    return endEventColors()
  }

  // Eventos intermedios
  if (
    isType(element, 'bpmn:IntermediateCatchEvent') ||
    isType(element, 'bpmn:IntermediateThrowEvent') ||
    isType(element, 'bpmn:BoundaryEvent')
  ) {
    return intermediateEventColors()
  }

  // Compuertas (todos los subtipos)
  if (
    isType(element, 'bpmn:ExclusiveGateway') ||
    isType(element, 'bpmn:ParallelGateway') ||
    isType(element, 'bpmn:InclusiveGateway') ||
    isType(element, 'bpmn:ComplexGateway') ||
    isType(element, 'bpmn:EventBasedGateway') ||
    isType(element, 'bpmn:Gateway')
  ) {
    return gatewayColors()
  }

  // Pools (Participant)
  if (isType(element, 'bpmn:Participant')) {
    return poolColors()
  }

  // Lanes
  if (isType(element, 'bpmn:Lane')) {
    return laneColors()
  }

  return defaultColors()
}

// ──────────────────────────────────────────────────────────────
// ThemeAwareRenderer — hereda de BpmnRenderer
// ──────────────────────────────────────────────────────────────

/**
 * @param {object} config
 * @param {import('diagram-js/lib/core/EventBus').default} eventBus
 * @param {import('diagram-js/lib/draw/Styles').default} styles
 * @param {import('bpmn-js/lib/draw/PathMap').default} pathMap
 * @param {import('diagram-js/lib/core/Canvas').default} canvas
 * @param {import('bpmn-js/lib/draw/TextRenderer').default} textRenderer
 */
function ThemeAwareRenderer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pathMap: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textRenderer: any,
) {
  // Prioridad > 1000 para que se ejecute ANTES del BpmnRenderer por defecto
  BpmnRenderer.call(this, config, eventBus, styles, pathMap, canvas, textRenderer, 1500)
}

inherits(ThemeAwareRenderer, BpmnRenderer)

ThemeAwareRenderer.$inject = [
  'config.bpmnRenderer',
  'eventBus',
  'styles',
  'pathMap',
  'canvas',
  'textRenderer',
]

/**
 * Puede renderizar cualquier elemento que el BpmnRenderer base puede.
 */
ThemeAwareRenderer.prototype.canRender = function (element: AnyElement): boolean {
  // Excluir labels — el base renderer los maneja bien
  if (element.labelTarget) return false
  return BpmnRenderer.prototype.canRender.call(this, element)
}

/**
 * Dibuja una shape inyectando los colores del tema.
 */
ThemeAwareRenderer.prototype.drawShape = function (
  parentGfx: SVGElement,
  element: AnyElement,
): SVGElement {
  const colors = getColorsFor(element)
  // Pasamos los colores como attrs — bpmn-js los aplica a través de
  // getFillColor / getStrokeColor / getLabelColor respetando el color DI
  return BpmnRenderer.prototype.drawShape.call(this, parentGfx, element, {
    fill:       colors.fill,
    stroke:     colors.stroke,
    defaultLabelColor: colors.labelColor,
  })
}

/**
 * Dibuja una conexión con el color del tema.
 */
ThemeAwareRenderer.prototype.drawConnection = function (
  parentGfx: SVGElement,
  element: AnyElement,
): SVGElement {
  const colors = connectionColors()
  return BpmnRenderer.prototype.drawConnection.call(this, parentGfx, element, {
    stroke:     colors.stroke,
    defaultLabelColor: colors.labelColor,
  })
}

export default ThemeAwareRenderer
