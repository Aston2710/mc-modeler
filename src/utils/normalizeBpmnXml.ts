import { BpmnModdle } from 'bpmn-moddle'
import flujoModdle from '@/bpmn/moddle/flujo.json'

/**
 * Re-serializa un XML BPMN a la forma canónica del serializer de moddle
 * (misma que produce modeler.saveXML()): prefijos `bpmn:`, atributos y
 * namespaces normalizados.
 *
 * Cierra el "dos dialectos" (`<bpmn:participant>` vs `<participant>`) del ADR
 * (pendiente §6.4): TODO XML que se persista debe pasar por el mismo
 * serializer. El autosave ya lo hace (saveXML del modeler); esto cubre el
 * camino del import, que antes guardaba el XML crudo del archivo.
 *
 * Lanza si el XML no parsea como BPMN — un archivo que moddle no entiende
 * tampoco abriría en el canvas; mejor rechazarlo al importar que persistirlo.
 */
const BPMN_MODEL_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL'

/**
 * Quita del elemento `definitions` (moddle) las declaraciones de namespace que
 * mapean el MODEL de BPMN al dialecto del input (p. ej. xmlns default sin
 * prefijo). El serializer de moddle entonces usa su prefijo preferido `bpmn:`.
 *
 * Uso post-import en el modeler (bpmn-js preserva el dialecto del input al
 * hacer saveXML): borrarlo UNA vez al importar hace que todos los guardados
 * posteriores salgan canónicos — cero costo por guardado. Los diagramas
 * legacy "sin prefijo" migran solos en su próximo autosave.
 */
export function forceCanonicalBpmnPrefix(definitions: unknown): void {
  const attrs = (definitions as { $attrs?: Record<string, string> } | null)?.$attrs
  if (!attrs) return
  for (const key of Object.keys(attrs)) {
    if ((key === 'xmlns' || key.startsWith('xmlns:')) && attrs[key] === BPMN_MODEL_NS) {
      delete attrs[key]
    }
  }
}

export async function normalizeBpmnXml(xml: string): Promise<string> {
  const moddle = new BpmnModdle({ flujo: flujoModdle })
  const { rootElement, warnings } = await moddle.fromXML(xml)
  if (!rootElement) throw new Error('XML sin raíz BPMN')
  if (warnings?.length) console.warn('[import] normalización con avisos:', warnings.length)
  // moddle PRESERVA el mapeo de namespaces del input (p. ej. xmlns default sin
  // prefijo, el "otro dialecto"). Quitar esas declaraciones del root obliga al
  // serializer a usar su prefijo preferido (`bpmn:`) → dialecto único.
  forceCanonicalBpmnPrefix(rootElement)
  const { xml: out } = await moddle.toXML(rootElement, { format: true })
  if (!out) throw new Error('normalización produjo XML vacío')
  return out
}
