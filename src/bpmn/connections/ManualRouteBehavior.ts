/**
 * ManualRouteBehavior — lifecycle del flag `flujo:manualRoute` DENTRO del
 * commandStack.
 *
 * Antes el flag se escribía con un set directo al businessObject al terminar
 * un drag (markManual), fuera de todo comando: Ctrl+Z restauraba los waypoints
 * pero dejaba el flag desincronizado (una flecha "auto" marcada como manual, o
 * viceversa), y el context pad mostraba "Restablecer ruta" en flechas sin editar.
 *
 * Ahora el flag se escribe con `modeling.updateModdleProperties` anidado en
 * postExecuted → entra en la misma unidad de undo que el comando que lo causó:
 * undo/redo restauran waypoints Y flag atómicamente, y la colaboración Yjs ve
 * un solo commandStack.changed por gesto.
 *
 * Reglas:
 *  - updateWaypoints con hints.segmentMove/bendpointMove (drag del usuario) → marcar manual
 *  - updateWaypoints con hints.resetRoute (botón del context pad)            → limpiar
 *  - connection.reconnect a OTRO elemento → limpiar (la forma ya no tiene sentido);
 *    al MISMO elemento (deslizar el extremo) → marcar manual
 *  - connection.layout que terminó en re-route completo (marker
 *    __orthoAutoRerouted del layouter, semántica Bizagi §14) → limpiar
 */

 
// @ts-ignore
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor'
import { isManual } from './manualRoute'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ManualRouteBehavior(this: any, injector: AnyObj, modeling: AnyObj) {
  injector.invoke(CommandInterceptor, this)

  function setFlag(conn: AnyObj, value: boolean) {
    if (!conn?.businessObject) return
    if (isManual(conn) === value) return
    modeling.updateModdleProperties(conn, conn.businessObject, {
      'flujo:manualRoute': value ? true : undefined,
    })
  }

  // Prioridad 1500: correr ANTES que OrthogonalityBehavior (500) para que la
  // reparación del invariante vea el flag manual ya actualizado.

  // Drag de segmento / bendpoint → manual. Reset del context pad → auto.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.postExecuted('connection.updateWaypoints', 1500, (event: any) => {
    const { connection, hints } = event.context
    if (!connection) return
    if (hints?.resetRoute) {
      setFlag(connection, false)
    } else if (hints?.segmentMove || hints?.bendpointMove) {
      setFlag(connection, true)
    }
  })

  // Capturar los extremos previos ANTES de que el handler los reemplace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.preExecute('connection.reconnect', (event: any) => {
    const ctx = event.context
    ctx.__prevSource = ctx.connection?.source
    ctx.__prevTarget = ctx.connection?.target
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.postExecuted('connection.reconnect', 1500, (event: any) => {
    const ctx = event.context
    const conn = ctx.connection
    if (!conn) return
    const elementChanged =
      (ctx.newSource && ctx.newSource !== ctx.__prevSource) ||
      (ctx.newTarget && ctx.newTarget !== ctx.__prevTarget)
    setFlag(conn, !elementChanged)
  })

  // El layouter decidió descartar la ruta manual (ganó la fresca) durante un
  // connection.layout — la señal viaja por context.hints (mismo objeto que
  // recibió layoutConnection) → limpiar el flag dentro del mismo comando.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.postExecuted('connection.layout', 1500, (event: any) => {
    const ctx = event.context
    if (ctx?.hints?.orthoAutoRerouted) {
      setFlag(ctx.connection, false)
    }
  })
}

ManualRouteBehavior.prototype = Object.create(CommandInterceptor.prototype)
ManualRouteBehavior.prototype.constructor = ManualRouteBehavior
ManualRouteBehavior.$inject = ['injector', 'modeling']

export default {
  __init__: ['manualRouteBehavior'],
  manualRouteBehavior: ['type', ManualRouteBehavior],
}
