import { crearModdle } from './construirXml'

/**
 * Sugerencias de la guía de modelado del equipo (skill `modelado-bpmn`,
 * docs/context/elementos-y-reglas-de-modelado.md) sobre un diagrama ya
 * construido.
 *
 * NO son errores ni bloquean nada. La guía es la convención por defecto
 * cuando la IA genera un diagrama, pero quien manda es el usuario: si pidió
 * otra cosa, se respeta. Por eso esto solo produce texto para que la IA lo
 * tenga en cuenta en la siguiente iteración, y nunca impide guardar.
 *
 * Tres comprobaciones, las que se pueden hacer de forma fiable sobre el XML:
 *  1. Nombre de tarea con verbo en 3.ª persona del singular. Se detectan las
 *     formas que la guía señala como incorrectas (infinitivo, gerundio,
 *     reflexivo "Se …", sustantivo en -ción/-miento). Es una heurística: puede
 *     fallar, y por eso el mensaje dice "parece".
 *  2. Ninguna compuerta desemboca directamente en un evento de fin.
 *  3. El nombre de una tarea es corto (verbo + objeto); el detalle va en una
 *     anotación.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bo = any

export type ReglaGuia = 'nombre_tarea_forma' | 'nombre_tarea_largo' | 'compuerta_a_fin'

export interface SugerenciaGuia {
  regla: ReglaGuia
  elemento_id: string
  elemento_nombre?: string
  mensaje: string
}

const ACTIVIDADES = new Set([
  'bpmn:Task', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:ManualTask', 'bpmn:ScriptTask',
  'bpmn:SendTask', 'bpmn:ReceiveTask', 'bpmn:BusinessRuleTask',
  'bpmn:SubProcess', 'bpmn:AdHocSubProcess', 'bpmn:Transaction', 'bpmn:CallActivity',
])

/** Más de esto ya no es "verbo + objeto" en una línea corta. */
const MAX_PALABRAS = 6

/** Qué forma tiene la primera palabra, si es una de las que la guía desaconseja. */
export function formaDesaconsejada(nombre: string): string | null {
  const limpio = nombre.trim().replace(/^[¿¡"'«(]+/, '')
  if (/^se\s/i.test(limpio)) return 'reflexivo ("Se …")'
  const primera = (limpio.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-záéíóúüñ]/g, '')
  if (primera.length < 4) return null
  if (/(ando|iendo|yendo)$/.test(primera)) return 'gerundio'
  if (/(ción|sión|miento)$/.test(primera)) return 'sustantivo'
  if (/(ar|er|ir)$/.test(primera)) return 'infinitivo'
  return null
}

export async function sugerenciasGuia(xml: string): Promise<SugerenciaGuia[]> {
  const { rootElement: defs } = await crearModdle().fromXML(xml)
  const sugerencias: SugerenciaGuia[] = []

  const revisarContenedor = (contenedor: Bo): void => {
    for (const el of contenedor.flowElements ?? []) {
      if (ACTIVIDADES.has(el.$type) && typeof el.name === 'string' && el.name.trim()) {
        const nombre = el.name.trim()
        const forma = formaDesaconsejada(nombre)
        if (forma) {
          sugerencias.push({
            regla: 'nombre_tarea_forma',
            elemento_id: el.id,
            elemento_nombre: nombre,
            mensaje: `«${nombre}» parece un ${forma}. La guía nombra las tareas con un verbo en 3.ª persona del singular más el objeto (p. ej. «Valida factura», «Registra el pago»).`,
          })
        }
        if (nombre.split(/\s+/).length > MAX_PALABRAS) {
          sugerencias.push({
            regla: 'nombre_tarea_largo',
            elemento_id: el.id,
            elemento_nombre: nombre,
            mensaje: `«${nombre}» es largo para una tarea. La guía usa verbo + objeto y deja el detalle en una anotación enlazada.`,
          })
        }
      }
      if (el.$type === 'bpmn:SequenceFlow' && /Gateway$/.test(el.sourceRef?.$type ?? '') && el.targetRef?.$type === 'bpmn:EndEvent') {
        sugerencias.push({
          regla: 'compuerta_a_fin',
          elemento_id: el.id,
          elemento_nombre: el.sourceRef.name,
          mensaje: `La compuerta ${el.sourceRef.name ? `«${el.sourceRef.name}»` : el.sourceRef.id} va directamente a un evento de fin. La guía pone siempre una tarea entre medias que nombre el trabajo de esa rama (p. ej. «Notifica el rechazo»).`,
        })
      }
      if (el.flowElements) revisarContenedor(el)
    }
  }

  for (const raiz of defs?.rootElements ?? []) {
    if (raiz.$type === 'bpmn:Process') revisarContenedor(raiz)
  }
  return sugerencias
}

/** Lo que se devuelve a la IA junto al resultado de una tool, o nada si no hay sugerencias. */
export function bloqueSugerencias(sugerencias: SugerenciaGuia[], guardado: boolean) {
  if (sugerencias.length === 0) return undefined
  return {
    nota:
      'Sugerencias de la guía de modelado del equipo (ver guia_modelado). ' +
      (guardado ? 'El diagrama YA se guardó: no son errores. ' : 'No son errores. ') +
      'Aplícalas en la siguiente iteración si el usuario no pidió expresamente otra cosa; si lo pidió, respeta su decisión y no insistas.',
    items: sugerencias,
  }
}
