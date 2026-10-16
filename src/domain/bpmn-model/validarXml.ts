import es from '../../i18n/es.json'
import { validateDiagram } from '../validation'
import type { ValidationResult } from '../types'
import { crearModdle } from './construirXml'

/**
 * `validateDiagram` —la misma que usa el botón Validar de la app— ejecutada
 * sobre el XML, sin bpmn-js.
 *
 * `validateDiagram` recibe un `elementRegistry` de diagram-js y solo lee de él
 * `getAll()`, `businessObject.$type/name/incoming/outgoing`, `children` e `id`.
 * Aquí se construye ese registro a partir del árbol de moddle: los pools (o el
 * proceso suelto) con sus nodos como hijos, como los coloca bpmn-js al
 * importar. Así el conector y la app avisan exactamente de lo mismo.
 *
 * Avisa, no bloquea: el resultado se devuelve a la IA y nunca impide guardar.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bo = any

export interface ResultadoValidacionXml {
  resultados: Pick<ValidationResult, 'severity' | 'code' | 'message' | 'elementId' | 'elementName'>[]
  avisos_lectura: string[]
}

const traducir = (clave: string): string => {
  let nodo: unknown = es
  for (const parte of clave.split('.')) nodo = (nodo as Record<string, unknown> | undefined)?.[parte]
  return typeof nodo === 'string' ? nodo : clave
}

export async function validarXml(xml: string): Promise<ResultadoValidacionXml> {
  const { rootElement: defs, warnings } = await crearModdle().fromXML(xml)
  const entradas = new Map<string, Bo[]>()
  const salidas = new Map<string, Bo[]>()
  const nodos: Bo[] = []

  const recorrer = (contenedor: Bo): Bo[] => {
    const hijos: Bo[] = []
    for (const el of contenedor.flowElements ?? []) {
      if (el.$type === 'bpmn:SequenceFlow') {
        if (el.sourceRef) salidas.set(el.sourceRef.id, [...(salidas.get(el.sourceRef.id) ?? []), el])
        if (el.targetRef) entradas.set(el.targetRef.id, [...(entradas.get(el.targetRef.id) ?? []), el])
        continue
      }
      const forma = { id: el.id, bo: el, children: el.flowElements ? recorrer(el) : [] }
      nodos.push(forma)
      hijos.push(forma)
    }
    return hijos
  }

  const raices: Bo[] = []
  const roots: Bo[] = defs?.rootElements ?? []
  const collaboration = roots.find((r) => r.$type === 'bpmn:Collaboration')
  const conPool = new Set<string>()
  for (const p of collaboration?.participants ?? []) {
    if (p.processRef) conPool.add(p.processRef.id)
    raices.push({ id: p.id, bo: p, children: p.processRef ? recorrer(p.processRef) : [] })
  }
  for (const r of roots) {
    if (r.$type === 'bpmn:Process' && !conPool.has(r.id)) raices.push({ id: r.id, bo: r, children: recorrer(r) })
  }

  // Forma de diagram-js: businessObject con incoming/outgoing calculados a
  // partir de los flujos, que en el XML pueden no venir declarados.
  const comoElemento = (f: Bo): Bo => ({
    id: f.id,
    children: f.children.map(comoElemento),
    businessObject: {
      $type: f.bo.$type,
      name: f.bo.name,
      processRef: f.bo.processRef,
      incoming: entradas.get(f.id) ?? [],
      outgoing: salidas.get(f.id) ?? [],
    },
  })
  const todos = [...raices, ...nodos].map(comoElemento)
  const resultados = validateDiagram({ getAll: () => todos }, traducir)
    .map(({ severity, code, message, elementId, elementName }) => ({ severity, code, message, elementId, elementName }))

  return { resultados, avisos_lectura: warnings.map((w: Bo) => String(w.message)) }
}
