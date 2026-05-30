/**
 * GroupConnectionRulesModule.ts — permite conectar Grupos con flechas.
 *
 * En BPMN estándar los `bpmn:Group` son artefactos decorativos sin conexiones.
 * Aquí habilitamos que un Group pueda emitir/recibir conexiones tipo
 * `bpmn:Association` con dirección (flecha), que es BPMN válido. Las **Fases**
 * (Group con id `Phase_*`) se excluyen: son fondos, no se conectan.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — diagram-js CommonJS sin tipos completos
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'
import { isPhase } from './phaseUtil'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const HIGH_PRIORITY = 2500

function isConnectableGroup(el: AnyObj): boolean {
  const bo = el?.businessObject
  return !!bo?.$instanceOf?.('bpmn:Group') && !isPhase(el)
}

function isShape(el: AnyObj): boolean {
  return !!el && !el.waypoints && !!el.businessObject && el.type !== 'label'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GroupConnectionRules(this: any, eventBus: any) {
  RuleProvider.call(this, eventBus)
}
inherits(GroupConnectionRules, RuleProvider)
GroupConnectionRules.$inject = ['eventBus']

GroupConnectionRules.prototype.init = function () {
  // Permitir iniciar una conexión desde un Group.
  this.addRule('connection.start', HIGH_PRIORITY, (context: AnyObj) => {
    if (isConnectableGroup(context.source)) return true
    return undefined // dejar decidir a BpmnRules
  })

  // Crear conexión cuando el Group es source o target → Association con flecha.
  this.addRule('connection.create', HIGH_PRIORITY, (context: AnyObj) => {
    const { source, target } = context
    if (!source || !target) return undefined
    if (isConnectableGroup(source) || isConnectableGroup(target)) {
      if (isShape(source) && isShape(target) && source !== target) {
        return { type: 'bpmn:Association', associationDirection: 'One' }
      }
      return false
    }
    return undefined
  })

  // Reconexión de extremos cuando hay un Group involucrado.
  const reconnect = (context: AnyObj) => {
    const { source, target } = context
    if (isConnectableGroup(source) || isConnectableGroup(target)) {
      if (isShape(source) && isShape(target) && source !== target) {
        return { type: 'bpmn:Association', associationDirection: 'One' }
      }
      return false
    }
    return undefined
  }
  this.addRule('connection.reconnectStart', HIGH_PRIORITY, reconnect)
  this.addRule('connection.reconnectEnd', HIGH_PRIORITY, reconnect)
}

const Module = {
  __init__: ['groupConnectionRules'],
  groupConnectionRules: ['type', GroupConnectionRules],
}

export default Module
