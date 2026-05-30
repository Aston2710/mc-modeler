import { markManual, isManual } from './manualRoute'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const RESET_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12a9 9 0 1 0 3-6.7L3 8'/%3E%3Cpath d='M3 3v5h5'/%3E%3C/svg%3E"

function isConnection(el: AnyObj): boolean {
  return Array.isArray(el?.waypoints)
}

/** Context pad para conexiones: botón "Restablecer ruta" (vuelve al auto-routing). */
function ConnectionContextPadProvider(
  this: AnyObj,
  contextPad: AnyObj,
  modeling: AnyObj,
  layouter: AnyObj,
  translate: AnyObj,
) {
  this._modeling = modeling
  this._layouter = layouter
  this._translate = translate
  contextPad.registerProvider(this)
}
ConnectionContextPadProvider.$inject = ['contextPad', 'modeling', 'layouter', 'translate']

ConnectionContextPadProvider.prototype.getContextPadEntries = function (element: AnyObj) {
  if (!isConnection(element)) return {}
  if (!element.source || !element.target) return {}
  // Solo tiene sentido restablecer si la ruta fue editada manualmente.
  if (!isManual(element)) return {}

  const modeling = this._modeling
  const layouter = this._layouter
  const t = this._translate

  return {
    'connection.resetRoute': {
      group: 'edit',
      title: t('Restablecer ruta'),
      imageUrl: RESET_ICON,
      action: {
        click(_event: MouseEvent, connection: AnyObj) {
          markManual(connection, false)
          const wp = layouter.layoutConnection(connection, {
            source: connection.source,
            target: connection.target,
          })
          if (wp?.length >= 2) modeling.updateWaypoints(connection, wp)
        },
      },
    },
  }
}

export default {
  __init__: ['connectionContextPadProvider'],
  connectionContextPadProvider: ['type', ConnectionContextPadProvider],
}
