/**
 * sanitizeBpmnXml.ts — saneo defensivo de XML BPMN antes de importarlo, y
 * detección de coordenadas no finitas antes de persistir.
 *
 * Contexto (ver docs/plan-canvas-y-fix-corrupcion.md): un diagrama se corrompió
 * porque una `bpmn:Association` tenía como `sourceRef` OTRA conexión (una
 * conexión no tiene bounds → el docking calculó `NaN`), y el autosave persistió
 * waypoints `NaN`. Al reabrir, bpmn-js core (`LineAttachmentUtil`) lanza
 * "expected between [1, 2] circle -> line intersections" y **rechaza `importXML`**,
 * dejando el modeler (único, compartido) en estado roto que contamina a los demás
 * diagramas hasta refrescar.
 *
 * Dos funciones puras (string-only, sin DOM → testeables en node y válidas en el
 * navegador):
 *  - `sanitizeBpmnXml`: contención al IMPORTAR. Quita asociaciones cuyo extremo
 *    es una conexión (BPMN inválido) y descarta la DI de aristas con waypoints no
 *    finitos → bpmn-js re-rutea esas conexiones con layout por defecto en vez de
 *    lanzar. Un diagrama ya corrupto abre degradado pero USABLE, y al guardarlo
 *    queda saneado (auto-reparación).
 *  - `hasNonFiniteCoords`: guarda al PERSISTIR. `true` si el XML tiene alguna
 *    coordenada NaN/Infinity → el llamador rechaza el guardado para que una
 *    corrupción transitoria nunca se vuelva durable.
 */

// Etiquetas de elementos que son CONEXIONES (tienen waypoints, no bounds).
const CONNECTION_TAGS = [
  'sequenceFlow', 'SequenceFlow',
  'association', 'Association',
  'messageFlow', 'MessageFlow',
  'dataInputAssociation', 'dataOutputAssociation',
]

const NON_FINITE = '(?:NaN|Infinity|-Infinity)'

/** true si alguna coordenada (x/y/width/height) del XML es no finita. */
export function hasNonFiniteCoords(xml: string): boolean {
  return new RegExp(`(?:\\bx|\\by|\\bwidth|\\bheight)="${NON_FINITE}"`).test(xml)
}

/** Escapa un id para uso literal dentro de una RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Ids de todos los elementos de tipo conexión declarados en el XML. */
function collectConnectionIds(xml: string): Set<string> {
  const re = new RegExp(
    `<bpmn:(?:${CONNECTION_TAGS.join('|')})\\b[^>]*\\bid="([^"]+)"`,
    'g',
  )
  const ids = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) ids.add(m[1])
  return ids
}

export interface SanitizeResult {
  xml: string
  changed: boolean
  /** ids de conexiones inválidas (extremo = conexión) eliminadas. */
  removedConnections: string[]
  /** ids (bpmnElement) de aristas cuya DI se descartó por waypoints no finitos. */
  strippedEdgeDi: string[]
}

/**
 * Sanea el XML para que `importXML` nunca reciba geometría que haga lanzar a
 * bpmn-js. Idempotente: sobre un XML sano devuelve `changed:false` sin tocar nada.
 */
export function sanitizeBpmnXml(xml: string): SanitizeResult {
  const removedConnections: string[] = []
  const strippedEdgeDi: string[] = []
  let out = xml

  const connIds = collectConnectionIds(out)

  // 1) Quitar Associations cuyo sourceRef/targetRef apunta a una conexión (BPMN
  //    inválido: una conexión no es un FlowNode). Forma self-closing (la real) y
  //    forma con bloque, por robustez.
  const refsAConexion = (tag: string): boolean => {
    const src = /\bsourceRef="([^"]+)"/.exec(tag)?.[1]
    const tgt = /\btargetRef="([^"]+)"/.exec(tag)?.[1]
    return (!!src && connIds.has(src)) || (!!tgt && connIds.has(tgt))
  }
  const recordId = (tag: string): void => {
    const id = /\bid="([^"]+)"/.exec(tag)?.[1]
    if (id) removedConnections.push(id)
  }

  // self-closing: <bpmn:Association ... />
  out = out.replace(/<bpmn:[Aa]ssociation\b[^>]*\/>/g, (tag) => {
    if (refsAConexion(tag)) { recordId(tag); return '' }
    return tag
  })
  // bloque: <bpmn:Association ...> ... </bpmn:Association>
  out = out.replace(/<bpmn:[Aa]ssociation\b[^>]*>[\s\S]*?<\/bpmn:[Aa]ssociation>/g, (block) => {
    const open = block.slice(0, block.indexOf('>') + 1)
    if (refsAConexion(open)) { recordId(open); return '' }
    return block
  })

  // 2) Quitar la DI (BPMNEdge) de las conexiones eliminadas.
  for (const id of removedConnections) {
    const esc = escapeRegExp(id)
    out = out.replace(
      new RegExp(`\\s*<bpmndi:BPMNEdge\\b[^>]*\\bbpmnElement="${esc}"[\\s\\S]*?<\\/bpmndi:BPMNEdge>`, 'g'),
      '',
    )
    out = out.replace(
      new RegExp(`\\s*<bpmndi:BPMNEdge\\b[^>]*\\bbpmnElement="${esc}"[^>]*\\/>`, 'g'),
      '',
    )
  }

  // 3) Descartar la DI de cualquier arista con waypoints no finitos → bpmn-js le
  //    calcula ruta por defecto al importar (en vez de lanzar). El elemento
  //    semántico se conserva.
  out = out.replace(/\s*<bpmndi:BPMNEdge\b[\s\S]*?<\/bpmndi:BPMNEdge>/g, (block) => {
    if (new RegExp(`<di:waypoint\\b[^>]*(?:x|y)="${NON_FINITE}"`).test(block)) {
      const id = /\bbpmnElement="([^"]+)"/.exec(block)?.[1]
      if (id) strippedEdgeDi.push(id)
      return ''
    }
    return block
  })

  // 4) Red de seguridad: cualquier coordenada no finita que sobreviva (p. ej.
  //    bounds NaN de un shape, que no se puede descartar sin perder el shape) se
  //    reemplaza por un valor seguro. x/y→0, width/height→1. Garantiza que NADA
  //    no finito llegue a importXML.
  out = out.replace(new RegExp(`(\\b[xy])="${NON_FINITE}"`, 'g'), '$1="0"')
  out = out.replace(new RegExp(`(\\bwidth|\\bheight)="${NON_FINITE}"`, 'g'), '$1="1"')

  return {
    xml: out,
    changed: out !== xml,
    removedConnections,
    strippedEdgeDi,
  }
}
