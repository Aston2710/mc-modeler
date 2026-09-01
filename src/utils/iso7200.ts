/**
 * iso7200.ts — el catálogo de campos de la cabecera de documento (PLAN-034 fase 5).
 *
 * LA NORMA. **ISO 7200:2004** — *«Technical product documentation — Data fields
 * in title blocks and document headers»*; en España, UNE-EN ISO 7200:2004. Su
 * título cubre dos objetos distintos y conviene no confundirlos:
 *
 * - **Cuadro de rotulación** (*title block*): el recuadro del ángulo inferior
 *   derecho de un plano, 180 mm de ancho.
 * - **Cabecera de documento** (*document header*): la banda superior a todo el
 *   ancho de la hoja.
 *
 * Lo que construye mc-modeler es lo segundo, y por eso se llama así.
 *
 * QUÉ ESTÁ VERIFICADO Y QUÉ NO. Los cinco campos obligatorios, los grupos de
 * campos opcionales y la lista cerrada del estado del documento salen de la
 * norma y de fuentes secundarias contrastadas. **Las longitudes máximas de
 * carácter que la norma sí especifica NO están aquí**: no se pudo leer el texto
 * normativo, y cablear un límite inventado sería peor que no tener ninguno.
 * Quien tenga acceso a la norma puede añadirlas en `maxLength`.
 *
 * POR QUÉ HAY UN CATÁLOGO Y NO UNA LISTA DE FILAS LIBRES. Un campo con su tipo
 * declarado se rellena con el control adecuado —un calendario, un contador, una
 * lista cerrada, un colaborador del proyecto— y entonces **no hay nada que
 * teclear y nada que teclear mal**. Con filas libres, todo acaba siendo texto.
 *
 * REGLA QUE GOBIERNA ESTE FICHERO: *si la norma fija los valores, son esos; si
 * no los fija, se escribe.* No inventamos vocabularios ni gramáticas de código
 * que la norma no define. Un código con segmentos obligatorios sería nuestro
 * invento, no un estándar, y convertiría la herramienta en el formato de una
 * empresa concreta.
 */
import type { DocumentMetaField } from '@/bpmn/elements/documentMeta'

/** Cómo se rellena un campo. Determina el control que se dibuja. */
export type FieldControl =
  /** Se escribe. Solo cuando la norma no fija valores. */
  | 'text'
  /** Calendario. Una fecha es una fecha: no se teclea. */
  | 'date'
  /** Lista cerrada. Los valores salen de la norma o del proyecto. */
  | 'choice'
  /** Una persona del proyecto. Se elige, no se escribe. */
  | 'person'
  /** Contador. Sube y baja; no se teclea. */
  | 'counter'

/** De dónde sale el valor sin que nadie lo ponga. */
export type FieldAuto =
  | 'diagramName'
  | 'lastModified'

export interface Iso7200Field {
  /** Campo de `DocumentMeta` donde se guarda, en el XML del diagrama. */
  id: DocumentMetaField
  /**
   * `true` si la norma lo declara obligatorio. Informativo: la herramienta no
   * bloquea una exportación por un campo vacío — el usuario manda.
   */
  mandatory: boolean
  /** `false` para los campos que NO vienen de ISO 7200. Se marca en la interfaz. */
  iso: boolean
  control: FieldControl
  /** Valores permitidos **por la norma**. Solo el estado del documento los tiene. */
  choices?: readonly string[]
  /** Relleno automático, cuando existe uno honesto. */
  auto?: FieldAuto
  /** Longitud máxima, si se conoce con certeza. Ver la cabecera del fichero. */
  maxLength?: number
}

/**
 * Estado del documento — **el único campo cuyo vocabulario fija la norma**.
 * Se guardan estos identificadores, no el texto traducido: cambiar de idioma no
 * puede cambiar el dato.
 */
export const DOCUMENT_STATUS = ['inPreparation', 'underApproval', 'released', 'withdrawn'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number]

/**
 * El catálogo. El orden es el de la norma: primero los obligatorios, después los
 * opcionales, y al final los que no son de ISO 7200 y se declaran como tal.
 */
export const ISO7200_FIELDS: readonly Iso7200Field[] = [
  // ── Obligatorios en ISO 7200 ──────────────────────────────────────────────
  // El nº de hoja y el nº de páginas también son de la norma, pero no están
  // aquí: se CALCULAN. Un diagrama es una página, así que son «1 / 1» y pedirlos
  // seria pedir que alguien se equivoque escribiéndolos.
  { id: 'code', mandatory: true, iso: true, control: 'text' },
  { id: 'title', mandatory: true, iso: true, control: 'text', auto: 'diagramName' },
  { id: 'date', mandatory: true, iso: true, control: 'date', auto: 'lastModified' },

  // ── Opcionales de ISO 7200 ────────────────────────────────────────────────
  //
  // TRES OPCIONALES DE LA NORMA SE QUEDARON FUERA, y no por olvido: su nombre en
  // español no ayuda a nadie. Decisión del usuario el 2026-08-23.
  //
  // · *Título suplementario* — nadie lo llama así, y un subtítulo en una banda de
  //   18 mm no cabe legible.
  // · *Referencia técnica* — el peor de los tres: suena a un código y en la norma
  //   significa «la persona de contacto». Un rótulo que engaña es peor que la
  //   falta del campo.
  // · *Departamento* — la palabra está bien, pero es dato de organigrama que
  //   nadie pidió y se solapa con «Elaboró».
  //
  // Que estén en la norma no las hace útiles aquí. Añadir un campo es añadir un
  // hueco que alguien tiene que rellenar, así que la carga de la prueba la tiene
  // el campo, no su ausencia. Si algún día hacen falta, esta lista y
  // `flujo.json` son los dos únicos sitios que hay que tocar.
  { id: 'status', mandatory: false, iso: true, control: 'choice', choices: DOCUMENT_STATUS },
  { id: 'author', mandatory: false, iso: true, control: 'person' },
  { id: 'approver', mandatory: false, iso: true, control: 'person' },

  // ── Fuera de ISO 7200 ─────────────────────────────────────────────────────
  // Vienen de la práctica de documentación de calidad (ISO 9001 §7.5), no de
  // ISO 7200. Se marcan para que nadie los defienda citando una norma que no
  // los contiene.
  { id: 'revision', mandatory: false, iso: false, control: 'counter' },
  { id: 'type', mandatory: false, iso: false, control: 'text' },
  { id: 'classification', mandatory: false, iso: false, control: 'text' },
  { id: 'distribution', mandatory: false, iso: false, control: 'text' },
]

const PORID = new Map(ISO7200_FIELDS.map((f) => [f.id, f]))

/** El campo del catálogo, o `undefined` si no está. */
export function fieldSpec(id: DocumentMetaField): Iso7200Field | undefined {
  return PORID.get(id)
}

/** Los campos obligatorios según la norma, en su orden. */
export function mandatoryFields(): readonly Iso7200Field[] {
  return ISO7200_FIELDS.filter((f) => f.mandatory)
}

/**
 * El nº de hoja, que la norma exige y la herramienta calcula.
 *
 * Un diagrama exportado es siempre una página: el mosaico se midió y se
 * descartó (D-E del plan). Si algún día deja de ser cierto, este es el único
 * sitio que hay que tocar.
 */
export function sheetNumber(): string {
  return '1 / 1'
}

/**
 * Valor de partida de un campo, sin que nadie escriba nada.
 *
 * Devuelve cadena vacía cuando no hay un automático honesto. Nunca inventa: un
 * valor puesto por la herramienta que el usuario no revisó es peor que un hueco,
 * porque el hueco se ve.
 */
export function autoValue(
  field: Iso7200Field,
  ctx: { diagramName?: string; lastModified?: Date | null }
): string {
  switch (field.auto) {
    case 'diagramName':
      return (ctx.diagramName ?? '').trim()
    case 'lastModified': {
      const d = ctx.lastModified
      if (!d || Number.isNaN(d.getTime())) return ''
      // ISO 8601, que es el formato que entiende <input type="date"> y el único
      // que no es ambiguo entre día y mes.
      return d.toISOString().slice(0, 10)
    }
    default:
      return ''
  }
}
