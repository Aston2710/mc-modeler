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
  // Permite arrastrar el punto de la flecha y soltarlo en cualquier borde del
  // grupo (o re-anclar el otro extremo) sin que la regla base lo convierta en
  // sequenceFlow. El docking (BizagiConnectionDocking) calcula el punto
  // cardinal exacto según hacia dónde se arrastre.
  const reconnect = (context: AnyObj) => {
    // El extremo que NO se mueve viene en la conexión; el que se mueve, en source/target.
    const conn = context.connection
    const source = context.source || conn?.source
    const target = context.target || conn?.target
    if (isConnectableGroup(source) || isConnectableGroup(target)) {
      if (isShape(source) && isShape(target) && source !== target) {
        return { type: 'bpmn:Association', associationDirection: 'One' }
      }
      return false
    }
    return undefined
  }
  // diagram-js v14+/bpmn-js v18 usa el evento unificado 'connection.reconnect'.
  this.addRule('connection.reconnect', HIGH_PRIORITY, reconnect)
  // Compatibilidad con nombres antiguos por si el entorno los emite.
  this.addRule('connection.reconnectStart', HIGH_PRIORITY, reconnect)
  this.addRule('connection.reconnectEnd', HIGH_PRIORITY, reconnect)
}

// ──────────────────────────────────────────────────────────────
// Context pad: añadir el botón "conectar" (flecha) a los grupos.
// bpmn-js solo lo ofrece a FlowNode/InteractionNode; los Group quedan fuera.
// Usamos el MISMO icono que el resto de elementos (bpmn-icon-connection-multi)
// para no romper la experiencia de usuario.
// ──────────────────────────────────────────────────────────────

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
      className: 'bpmn-icon-connection-multi',
      title: t('Conectar con otro elemento'),
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
