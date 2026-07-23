/**
 * ConnectionEndpointRulesModule.ts — veta conectar DESDE/HACIA una conexión.
 *
 * Raíz de la corrupción de "se corrompio, abro ticket": una `bpmn:Association`
 * quedó con `sourceRef` apuntando a OTRA Association. Una conexión no tiene
 * bounds (`x/y/width/height`), así que el docking/routing calcula `NaN`, y al
 * reimportar bpmn-js core lanza y rechaza el import. Este módulo cierra la puerta
 * en la UI: ninguna conexión puede empezar, crearse ni reconectarse con un
 * extremo que sea otra conexión.
 *
 * Prioridad 3000: por encima de BpmnRules (1000) y de GroupConnectionRules
 * (2500) → el veto gana. Devuelve `undefined` cuando no aplica, para no
 * interferir con las demás reglas.
 */


// @ts-ignore — diagram-js CommonJS sin tipos completos
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'

// @ts-ignore
import inherits from 'inherits-browser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const VETO_PRIORITY = 3000

/** true si el elemento es una conexión (tiene waypoints, no bounds). */
function isConnectionEl(el: AnyObj): boolean {
  return !!el && Array.isArray(el.waypoints)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConnectionEndpointRules(this: any, eventBus: any) {
  RuleProvider.call(this, eventBus)
}
inherits(ConnectionEndpointRules, RuleProvider)
ConnectionEndpointRules.$inject = ['eventBus']

ConnectionEndpointRules.prototype.init = function () {
  // create / reconnect: el extremo que se mueve viene en context.source|target;
  // el fijo, en context.connection. Vetar si CUALQUIERA es una conexión.
  const veto = (context: AnyObj) => {
    const conn = context.connection
    const source = context.source ?? conn?.source
    const target = context.target ?? conn?.target
    if (isConnectionEl(source) || isConnectionEl(target)) return false
    return undefined
  }

  this.addRule('connection.create', VETO_PRIORITY, veto)
  this.addRule('connection.reconnect', VETO_PRIORITY, veto)
  // Nombres antiguos por compatibilidad con distintas versiones de diagram-js.
  this.addRule('connection.reconnectStart', VETO_PRIORITY, veto)
  this.addRule('connection.reconnectEnd', VETO_PRIORITY, veto)

  // No permitir INICIAR una conexión desde una conexión.
  this.addRule('connection.start', VETO_PRIORITY, (context: AnyObj) => {
    if (isConnectionEl(context.source)) return false
    return undefined
  })
}

const Module = {
  __init__: ['connectionEndpointRules'],
  connectionEndpointRules: ['type', ConnectionEndpointRules],
}

export default Module
