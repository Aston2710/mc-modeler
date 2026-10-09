/**
 * Modeler oculto: renderiza un diagrama sin abrirlo en el editor.
 *
 * Lo usan dos sitios:
 *  - la portada, para generar las miniaturas que faltan
 *    (`utils/thumbnailBackfill.ts`), en un chunk aparte que solo se descarga
 *    si hay alguna que generar;
 *  - la forja del laboratorio (`lab/thumbForge.ts`), para el backfill masivo
 *    de PLAN-012.
 *
 * Usa el MISMO `MODELER_CONFIG` que el editor, no un viewer pelado: el SVG de
 * esta app depende de `ThemeAwareRendererModule`, `PhaseModule`,
 * `StickyLaneLabelsModule` y de la extensión `flujo`. Con otra configuración
 * las miniaturas saldrían distintas de las que se hacen al guardar (ver la
 * cabecera de `thumbForge.ts`).
 *
 * Revisado que no interfiere con la página: `bpmn-js-native-copy-paste` solo
 * escucha el bus de eventos de SU modeler, el teclado no se engancha a un
 * contenedor que nunca recibe el foco, y los `window.addEventListener` de
 * `GroupMoveModule` y `ScrollPanModule` solo cambian estado de esta instancia.
 */
// @ts-ignore — bpmn-js es CommonJS con tipos incompletos
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { MODELER_CONFIG } from '@/bpmn/config'
import { buildThumbnail, topPoolCrop } from '@/utils/thumbnailUtils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modeler: any = null
let host: HTMLDivElement | null = null

/**
 * Un único Modeler reutilizado: crear y destruir uno por diagrama multiplicaba
 * por seis el tiempo del backfill sin cambiar el resultado (`importXML`
 * reemplaza el estado entero en cada llamada).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function obtenerModelerOculto(): any {
  if (modeler) return modeler
  host = document.createElement('div')
  // Fuera de la vista pero CON tamaño: un contenedor de 0×0 hace que bpmn-js
  // calcule un viewbox degenerado y el SVG sale vacío.
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1600px;height:1200px;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)
  modeler = new BpmnModeler({ ...MODELER_CONFIG, container: host })
  return modeler
}

export function liberarModelerOculto(): void {
  try {
    modeler?.destroy()
  } catch {
    /* best-effort: solo libera memoria */
  }
  host?.remove()
  modeler = null
  host = null
}

/** La miniatura de un XML por el camino REAL del guardado (`buildThumbnail`). */
export async function renderizarMiniatura(xml: string): Promise<string> {
  const m = obtenerModelerOculto()
  await m.importXML(xml)
  return buildThumbnail(
    async () => (await m.saveSVG()).svg,
    () => topPoolCrop(m.get('elementRegistry'))
  )
}
