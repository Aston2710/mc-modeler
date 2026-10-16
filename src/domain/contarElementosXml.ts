/**
 * Cuántos elementos tiene un diagrama, contando sobre el TEXTO del XML.
 *
 * POR QUÉ. `diagrams.element_count` es lo que la portada enseña en cada
 * tarjeta ("23 elementos") y lo que usa el orden por tamaño. La app lo guardaba
 * siempre a 0: ningún guardado se lo pasaba a `saveDiagram`, que lo ponía a 0
 * por defecto. Solo los diagramas del conector MCP traían el número.
 *
 * QUÉ CUENTA. Lo mismo que `contarElementos` del conector (sobre el árbol de
 * moddle), para que una misma fila no cambie de número según quién la guarde:
 * pools, flujos de mensaje, carriles (también los anidados) y todos los
 * elementos de flujo —nodos y flujos de secuencia—, también dentro de
 * subprocesos. No cuenta anotaciones, asociaciones ni grupos. La prueba
 * `contarElementosXml.test.ts` comprueba que los dos dan lo mismo.
 *
 * POR QUÉ SOBRE EL TEXTO. Se llama en cada autosave; parsear el XML con moddle
 * para contar costaría tanto como el propio guardado. El XML que llega aquí ya
 * está normalizado (prefijo `bpmn:`), y las extensiones (`flujo:`, `bizagi:`)
 * llevan su propio prefijo, así que no se confunden. La comparación ignora
 * mayúsculas: el serializador escribe `bpmn:SequenceFlow` y bpmn.io
 * `bpmn:sequenceFlow`.
 */

/** Tipos concretos que heredan de `FlowElement` en bpmn-moddle, más los contenedores. */
const TIPOS = [
  // Elementos de flujo (bpmn.json: no abstractos, superclase FlowElement).
  'Task', 'UserTask', 'ServiceTask', 'SendTask', 'ReceiveTask', 'ManualTask', 'ScriptTask', 'BusinessRuleTask',
  'SubProcess', 'AdHocSubProcess', 'Transaction', 'CallActivity',
  'StartEvent', 'EndEvent', 'IntermediateCatchEvent', 'IntermediateThrowEvent', 'BoundaryEvent', 'ImplicitThrowEvent',
  'ExclusiveGateway', 'InclusiveGateway', 'ParallelGateway', 'ComplexGateway', 'EventBasedGateway',
  'DataObject', 'DataObjectReference', 'DataStoreReference',
  'SequenceFlow',
  'ChoreographyTask', 'SubChoreography', 'CallChoreography',
  // Contenedores y colaboración.
  'Participant', 'Lane', 'MessageFlow',
]

// `<bpmn:Lane ` o `<Lane>` (espacio de nombres por defecto), pero no
// `<bpmn:LaneSet` ni `<bpmndi:...>`: tras el nombre tiene que venir un espacio,
// `/` o `>`.
const PATRON = new RegExp(`<(?:bpmn2?:)?(?:${TIPOS.join('|')})(?=[\\s/>])`, 'gi')

export function contarElementosXml(xml: string): number {
  if (!xml) return 0
  return xml.match(PATRON)?.length ?? 0
}
