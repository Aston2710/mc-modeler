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

// ──────────────────────────────────────────────────────────────
// Context pad: añadir el botón "conectar" (flecha) a los grupos.
// bpmn-js solo lo ofrece a FlowNode/InteractionNode; los Group quedan fuera.
// ──────────────────────────────────────────────────────────────
const CONNECT_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='7' y1='17' x2='17' y2='7'/%3E%3Cpolyline points='7 7 17 7 17 17'/%3E%3C/svg%3E"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GroupContextPadProvider(this: any, contextPad: any, connect: any, translate: any) {
  this._connect = connect
  this._translate = translate
  contextPad.registerProvider(this)
}
GroupContextPadProvider.$inject = ['contextPad', 'connect', 'translate']

GroupContextPadProvider.prototype.getContextPadEntries = function (element: AnyObj) {
  if (!isConnectableGroup(element)) return {}
  const connect = this._connect
  const t = this._translate
  const startConnect = (event: AnyObj, el: AnyObj) => connect.start(event, el)
  return {
    'connect': {
      group: 'connect',
      title: t('Conectar con otro elemento'),
      imageUrl: CONNECT_ICON,
      action: { click: startConnect, dragstart: startConnect },
    },
  }
}

const Module = {
  __init__: ['groupConnectionRules', 'groupContextPadProvider'],
  groupConnectionRules: ['type', GroupConnectionRules],
  groupContextPadProvider: ['type', GroupContextPadProvider],
}

export default Module
