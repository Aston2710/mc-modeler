/**
 * manualRoute.ts — marca de "ruta manual" en una conexión.
 *
 * Cuando el usuario arrastra una flecha, se marca `flujo:manualRoute=true` en su
 * businessObject. Esto persiste en el XML y le dice al layouter/normalizer que
 * NO re-rutee esa conexión: respeta los waypoints que el usuario dejó.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

export function isManual(connection: AnyObj): boolean {
  const bo = connection?.businessObject ?? connection
  return !!(bo?.get?.('flujo:manualRoute') ?? bo?.manualRoute)
}

/** Marca/desmarca la conexión como ruta manual (set directo en el businessObject). */
export function markManual(connection: AnyObj, value: boolean): void {
  const bo = connection?.businessObject ?? connection
  if (!bo) return
  if (typeof bo.set === 'function') bo.set('flujo:manualRoute', value ? true : undefined)
  else if (value) bo.manualRoute = true
  else delete bo.manualRoute
}
