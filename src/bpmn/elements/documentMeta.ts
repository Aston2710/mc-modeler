/**
 * documentMeta.ts — datos del documento que rodea al diagrama (PLAN-034).
 *
 * Son los campos de la **cabecera de documento** de ISO 7200: nº de identificación,
 * fecha, estado… El catálogo y la procedencia normativa de cada uno viven en
 * `utils/iso7200.ts`; qué campos se muestran lo decide la plantilla del proyecto.
 *
 * DÓNDE VIVEN, Y POR QUÉ NO COMO `extends`. Van como un elemento
 * `flujo:DocumentMeta` dentro del `bpmn:extensionElements` del elemento raíz
 * (el Process o la Collaboration). **No** como atributos añadidos a
 * `bpmn:Definitions` con `extends`, que fue el primer intento y resultó
 * corromper el XML: declarar `extends` sobre un tipo CONCRETO hace que moddle
 * serialice sus instancias con el nombre del tipo —`<bpmn:Definitions>` en vez
 * de `<bpmn:definitions>`— y eso no valida contra el XSD de BPMN 2.0.
 *
 * Está medido en `moddle/extensionCasing.test.ts`, y no es hipotético: las
 * extensiones que ya existían dejaron 139 diagramas de producción con
 * `<bpmn:SequenceFlow>`, 40 con `<bpmn:Group>` y 20 con `<bpmn:SubProcess>`.
 * `extensionElements` es justo el mecanismo previsto para esto y no toca el
 * descriptor de ningún tipo de bpmn.
 *
 * Consecuencias buscadas:
 * - Viajan dentro de `current_xml`, protegidos por CAS igual que el resto.
 * - Sobreviven a la colaboración sin tocar el binding de Yjs.
 * - **Van y vuelven por `.bpmn` sin pérdida**, y otro modelador los ignora sin
 *   romperse, que es como debe comportarse una extensión.
 *
 * LO QUE NO SE HACE AQUÍ. La cabecera **no se dibuja como elementos BPMN**. Si
 * entrara en el modelo contaminaría el `.bpmn` exportado, participaría en el
 * routing y en el binding, y cualquiera podría moverlo o borrarlo sin querer.
 * Se dibuja en la exportación (`utils/documentHeader.ts`).
 *
 * POR QUÉ CAMPOS CON NOMBRE Y NO UN JSON. Se consideró un mapa libre para que la
 * plantilla inventase campos. Descartado: los del catálogo son los de un documento
 * controlado al uso, son estables, y con nombre quedan legibles en el XML e
 * inspeccionables desde fuera. La plantilla decide **cuáles se muestran**, no
 * cuáles existen.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any

export const DOCUMENT_META_TYPE = 'flujo:DocumentMeta'

/**
 * Campos del documento. Todos opcionales: un diagrama sin cabecera no tiene
 * ninguno. Qué campos existen y con qué control se rellenan lo declara
 * `utils/iso7200.ts`, que es donde vive la procedencia normativa de cada uno.
 */
export interface DocumentMeta {
  /** ISO 7200, obligatorio · Título. Por omisión, el nombre del diagrama. */
  title: string
  /** ISO 7200, obligatorio · Nº de identificación o registro. */
  code: string
  /** ISO 7200, obligatorio · Fecha de edición. Se guarda en ISO 8601. */
  date: string
  /** ISO 7200, opcional · Estado del documento. **Lista cerrada por la norma.** */
  status: string
  /** ISO 7200, opcional · Creado por. */
  author: string
  /** ISO 7200, opcional · Aprobado por. */
  approver: string
  /** FUERA de ISO 7200 — práctica de documentación de calidad. */
  revision: string
  /** FUERA de ISO 7200 · Norma, Instructivo, Procedimiento… */
  type: string
  /** FUERA de ISO 7200 · Interna, Restringida, Pública… */
  classification: string
  /** FUERA de ISO 7200. */
  distribution: string
}

export const DOCUMENT_META_FIELDS = [
  'title', 'code', 'date', 'status', 'author', 'approver',
  'revision', 'type', 'classification', 'distribution',
] as const

export type DocumentMetaField = (typeof DOCUMENT_META_FIELDS)[number]

export const EMPTY_DOCUMENT_META: DocumentMeta = {
  title: '', code: '', date: '', status: '',
  author: '', approver: '',
  revision: '', type: '', classification: '', distribution: '',
}

/** `title` → `docTitle`, que es como se llama la propiedad en el moddle. */
const propOf = (f: DocumentMetaField) => `doc${f.charAt(0).toUpperCase()}${f.slice(1)}`

const boOf = (el: AnyEl): AnyEl => el?.businessObject ?? el

/** El elemento `flujo:DocumentMeta` del raíz, o `null` si aún no existe. */
export function findDocumentMeta(root: AnyEl): AnyEl | null {
  const bo = boOf(root)
  const valores = bo?.extensionElements?.values
  if (!Array.isArray(valores)) return null
  return valores.find((v: AnyEl) => v?.$type === DOCUMENT_META_TYPE) ?? null
}

/**
 * Devuelve el elemento, creándolo —y creando el `extensionElements` que lo
 * contiene— si no estaba.
 *
 * `moddle` es la factoría de bpmn-js (`modeler.get('moddle')`). Se pasa en vez
 * de importarla para que este módulo siga siendo probable sin arrancar bpmn-js.
 */
export function ensureDocumentMeta(moddle: AnyEl, root: AnyEl): AnyEl {
  const bo = boOf(root)
  const existente = findDocumentMeta(bo)
  if (existente) return existente

  if (!bo.extensionElements) {
    bo.extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] })
    bo.extensionElements.$parent = bo
  }
  if (!Array.isArray(bo.extensionElements.values)) bo.extensionElements.values = []

  const meta = moddle.create(DOCUMENT_META_TYPE, {})
  meta.$parent = bo.extensionElements
  bo.extensionElements.values.push(meta)
  return meta
}

/** Lee los datos del documento. Devuelve todos los campos, vacíos si no hay nada. */
export function readDocumentMeta(root: AnyEl): DocumentMeta {
  const el = findDocumentMeta(root)
  const out = { ...EMPTY_DOCUMENT_META }
  if (!el) return out
  for (const f of DOCUMENT_META_FIELDS) {
    const p = propOf(f)
    const v = el.get?.(p) ?? el[p]
    out[f] = v == null ? '' : String(v)
  }
  return out
}

/**
 * Convierte los campos al formato del moddle, con los vacíos en `undefined`.
 *
 * `undefined` y no cadena vacía: así el atributo **no se serializa** y un
 * documento sin cabecera produce un `.bpmn` idéntico al de antes de que esto
 * existiera. Útil también para `modeling.updateModdleProperties`, que es la vía
 * con undo/redo.
 */
export function toModdleProps(meta: Partial<DocumentMeta>): Record<string, string | undefined> {
  const props: Record<string, string | undefined> = {}
  for (const f of DOCUMENT_META_FIELDS) {
    if (!(f in meta)) continue
    props[propOf(f)] = (meta[f] ?? '').trim() || undefined
  }
  return props
}

/**
 * Escritura directa, sin pasar por el commandStack. Para caminos que no son de
 * interfaz (importación, migración). La interfaz debe usar
 * `modeling.updateModdleProperties` con `toModdleProps` para conservar el undo.
 */
export function writeDocumentMeta(moddle: AnyEl, root: AnyEl, meta: Partial<DocumentMeta>): void {
  const el = ensureDocumentMeta(moddle, root)
  const props = toModdleProps(meta)
  for (const [k, v] of Object.entries(props)) {
    if (typeof el.set === 'function') el.set(k, v)
    else el[k] = v
  }
}

/** `true` si hay algo que dibujar. Una cabecera vacía no se pinta. */
export function hasDocumentMeta(meta: DocumentMeta): boolean {
  return DOCUMENT_META_FIELDS.some((f) => meta[f].trim() !== '')
}
