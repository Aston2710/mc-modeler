/**
 * CustomResizeModule.ts (v2)
 *
 * Habilita resize en todos los shapes BPMN excepto conexiones y labels.
 *
 * Por qué v1 no funcionó:
 *   Rules.allowed → commandStack.canExecute → dispara 'shape.resize.canExecute'
 *   (NO un evento 'rules.allowed'). RuleProvider.addRule internamente usa
 *   CommandInterceptor.canExecute que hookea ese evento.
 *
 * Prioridad 1500 > default de bpmn-js (1000): interceptamos primero para
 * tasks/events/gateways. SubProcess/Participant/Lane: se pasan a bpmn-js
 * para que aplique su lógica propia (expanded vs collapsed, etc.).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const MIN_BOUNDS: Record<string, { width: number; height: number }> = {
  'bpmn:Task':    { width: 80, height: 40 },
  'bpmn:Gateway': { width: 40, height: 40 },
  'bpmn:Event':   { width: 30, height: 30 },
}

const FALLBACK_MIN = { width: 30, height: 30 }

function minBoundsFor(shape: AnyObj) {
  const bo = shape?.businessObject
  if (!bo) return FALLBACK_MIN
  for (const [type, size] of Object.entries(MIN_BOUNDS)) {
    if (bo.$instanceOf?.(type)) return size
  }
  return FALLBACK_MIN
}

function isSkipped(shape: AnyObj): boolean {
  if (!shape || shape.waypoints) return true  // conexiones/flechas
  if (shape.labelTarget)         return true  // labels flotantes

  const bo = shape?.businessObject
  if (!bo) return true

  // Contenedores raíz
  if (bo.$instanceOf?.('bpmn:Process') || bo.$instanceOf?.('bpmn:Collaboration')) return true

  // SubProcess, Participant, Lane: bpmn-js ya los maneja con su lógica propia
  if (bo.$instanceOf?.('bpmn:SubProcess'))  return true
  if (bo.$instanceOf?.('bpmn:Participant')) return true
  if (bo.$instanceOf?.('bpmn:Lane'))        return true

  return false
}

function CustomResizeRules(eventBus: AnyObj) {
  // 'shape.resize.canExecute' es el evento real que dispara commandStack.canExecute('shape.resize').
  // Prioridad 1500 corre antes que bpmn-js (1000). Retornar true detiene propagación
  // → bpmn-js no puede sobreescribir con false para tasks/events/gateways.
  eventBus.on('shape.resize.canExecute', 1500, (event: AnyObj) => {
    const ctx = event.context ?? event
    const { shape, newBounds } = ctx

    if (isSkipped(shape)) return  // pasar a reglas default de bpmn-js

    // Tamaño mínimo durante resize activo
    if (newBounds) {
      const min = minBoundsFor(shape)
      if (newBounds.width < min.width || newBounds.height < min.height) return false
    }

    return true  // permite resize, detiene propagación
  })
}

CustomResizeRules.$inject = ['eventBus']

const CustomResizeModule = {
  __init__: ['customResizeRules'],
  customResizeRules: ['type', CustomResizeRules],
}

export default CustomResizeModule
