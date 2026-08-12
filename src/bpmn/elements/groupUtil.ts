/**
 * groupUtil.ts — color de borde personalizable de un `bpmn:Group`.
 *
 * Un Group se dibuja con borde punteado (dash-dot: `strokeDasharray '10, 6, 0, 6'`
 * de bpmn-js). Este módulo persiste el color de ese borde; las muestras
 * disponibles viven en `colorPalette.ts`.
 *
 * **Los colores no tienen semántica.** Cada quien los usa como quiera. No añadir
 * aquí etiquetas de significado.
 *
 * Persistencia: `flujo:groupColor` (extensión moddle), mismo patrón que
 * `flujo:phaseColor` — ver `phaseUtil.ts`. NO se usa `bioc:stroke` porque
 * `getStrokeColor(element, default, override)` de bpmn-js da prioridad al
 * `override` que el renderer pasa siempre en `attrs.stroke`, así que el color DI
 * quedaría ignorado. El color se inyecta en `getColorsFor` (ThemeAwareRenderer).
 *
 * Export a Bizagi: el hex se convierte a entero ARGB Int32 con signo en
 * `bpmExport.ts` (`hexToBizagiColor`).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any

/** Sin color propio: el group usa el gris del tema (`--group-stroke`). */
export const GROUP_COLOR_DEFAULT = ''

/**
 * Color de borde del Group, o `''` si usa el del tema.
 *
 * Las Fases también son `bpmn:Group` (convención de id `Phase_*`, ver
 * `phaseUtil.ts`) pero su color es de **relleno** y vive en `flujo:phaseColor`.
 * Quien llame a esto sobre una Fase obtendrá `''`, que es lo correcto: su borde
 * lo fija `MILESTONE_BORDER`.
 */
export function getGroupColor(element: AnyEl): string {
  const bo = element?.businessObject ?? element
  if (!bo) return GROUP_COLOR_DEFAULT
  return (bo.get?.('flujo:groupColor') ?? bo.groupColor ?? GROUP_COLOR_DEFAULT) as string
}

/** Escribe el color de borde en `flujo:groupColor`. Cadena vacía = volver al tema. */
export function setGroupColor(element: AnyEl, color: string): void {
  const bo = element?.businessObject ?? element
  if (!bo) return
  // `undefined` (no `''`) para que el atributo NO se serialice al XML cuando se
  // vuelve al color del tema — así el BPMN queda limpio.
  if (typeof bo.set === 'function') bo.set('flujo:groupColor', color || undefined)
  else bo.groupColor = color
}
