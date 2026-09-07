/**
 * documentHeader.ts — la cabecera del documento (PLAN-034 fase 2).
 *
 * Una **cabecera de documento** es la banda superior con el logo, el título y los
 * códigos de control. El nombre no es nuestro: lo fija **ISO 7200**, cuyo título
 * cubre los *cuadros de rotulación* —abajo a la derecha en un plano— y las
 * *cabeceras de documento*, que es lo que se construye aquí. Ver `utils/iso7200.ts`.
 *
 * LA HERRAMIENTA NO SE CABLEA A NINGUNA EMPRESA. Ni un logo ni un formato entra
 * en el repositorio. `DEFAULT_DOCUMENT_HEADER` sale **sin logo y con etiquetas
 * genéricas**; el logo es un dato que cada quien sube a su proyecto. Una
 * universidad, una consultora o un estudiante crean el suyo desde cero.
 *
 * LAS MEDIDAS POR DEFECTO ESTÁN MEDIDAS, no inventadas. Salen de leer el XML de
 * un `.docx` normativo real: tres columnas de 40.0 │ 74.6 │ 50.3 mm (164.9 en
 * total, que es exactamente el ancho útil de una Carta vertical con márgenes de
 * 25.4) y un logo de 20.4 × 12.1 mm. Se guardan como proporciones y se escalan
 * al ancho disponible, así que la misma cabecera sirve en Carta, A4 o A3, en
 * vertical o apaisada.
 *
 * Se dibuja con las primitivas de jsPDF, así que **es vectorial** vaya el
 * diagrama en vector o no. Salvo el logo, que es una imagen y no puede ser otra
 * cosa.
 */
import type { jsPDF } from 'jspdf'
import { MM_PER_POINT } from './pageLayout'
import type { DocumentMeta, DocumentMetaField } from '@/bpmn/elements/documentMeta'

/** Una fila de la celda derecha: etiqueta más el campo del que sale el valor. */
export interface DocumentHeaderRow {
  field: DocumentMetaField
  label: string
}

export interface DocumentHeaderTemplate {
  /** Si está apagado no se reserva altura ni se dibuja nada. */
  enabled: boolean
  /** Alto del recuadro en mm. */
  height: number
  /**
   * Anchos relativos de las tres celdas: logo │ título │ códigos. Se escalan
   * para llenar el ancho disponible, así que lo que importa es la proporción.
   */
  columns: [number, number, number]
  /**
   * Logo como data URL, o `null`. Nunca hay uno por defecto.
   *
   * Debe llegar aquí ya **preparado** (`utils/logoImage.ts`): PNG re-codificado
   * por el navegador. El WebP que guarda la biblioteca lo destroza el
   * decodificador que trae jsPDF — ver el encabezado de ese módulo.
   */
  logo: string | null
  /**
   * Proporción ancho/alto **real** del logo, medida al prepararlo.
   *
   * Sin esto `fitLogo` cae en la del estándar medido (20.4/12.1) y **deforma
   * cualquier logo que no tenga esa forma**, que son casi todos.
   */
  logoAspect?: number
  /** Campo que ocupa la celda central. */
  titleField: DocumentMetaField
  /** Filas de la celda derecha, en orden. */
  rows: DocumentHeaderRow[]
  borderColor: string
  textColor: string
  /** Cuerpo del texto de las filas, en puntos. El título va algo mayor. */
  fontSize: number
}

/**
 * Cabecera genérica. Mismas proporciones que el estándar medido, **sin logo y
 * sin nombrar a nadie**. Es lo que se publica.
 */
export const DEFAULT_DOCUMENT_HEADER: DocumentHeaderTemplate = {
  enabled: false,
  height: 18,
  columns: [40, 74.6, 50.3],
  logo: null,
  titleField: 'title',
  /**
   * Campos por defecto, con etiquetas de reserva.
   *
   * **La aplicación nunca usa estas etiquetas**: `resolveDocumentHeader` las
   * sustituye por las del catálogo traducido. Están aquí para los llamadores que
   * no traducen —el laboratorio y las pruebas—, porque una etiqueta vacía
   * dibujaría una cabecera con los valores flotando sin decir de qué son.
   */
  rows: [
    { field: 'code', label: 'Código:' },
    { field: 'date', label: 'Fecha:' },
    { field: 'revision', label: 'Revisión:' },
  ],
  borderColor: '#000000',
  textColor: '#000000',
  fontSize: 8,
}

/**
 * La plantilla **tal como se guarda** en `projects.doc_template`.
 *
 * Se diferencia de `DocumentHeaderTemplate` en una sola cosa, y es deliberada: el
 * logo se guarda como **referencia** a la biblioteca de imágenes
 * (`logoImageId` → `public.images`), no como data URL. Meter cientos de kB de
 * base64 en la tabla `projects` habría cargado la consulta de la portada, que es
 * la trampa que PLAN-012 desmontó con `LIST_COLUMNS`.
 *
 * Se resuelve a `DocumentHeaderTemplate` con `resolveDocumentHeader` justo antes de
 * dibujar, que es el único momento en que hacen falta los bytes.
 *
 * OJO AL COMPARAR: la columna es `jsonb`, que guarda una representación parseada
 * y **reordena las claves**. Dos plantillas idénticas pueden dar
 * `JSON.stringify` distintos. Para saber si una plantilla cambió hay que
 * comparar en profundidad, nunca por texto.
 */
export type StoredDocumentHeader = Omit<DocumentHeaderTemplate, 'logo' | 'logoAspect' | 'rows'> & {
  logoImageId: string | null
  /**
   * Los **bytes** del logo, para el diagrama que no está en ningún proyecto.
   *
   * PARECE CONTRADECIR LO DE ARRIBA Y NO LO HACE: los dos caminos no se cruzan
   * nunca. Un diagrama suelto no tiene proyecto, así que no tiene biblioteca
   * donde referenciar una imagen — la biblioteca es por proyecto. Su plantilla
   * vive **en el navegador** (`utils/localDocumentHeader.ts`), no en ninguna
   * tabla, así que el base64 no carga ninguna consulta de nadie.
   *
   * LA SEPARACIÓN ESTÁ FORZADA POR CONSTRUCCIÓN, no por convenio:
   * `parseStoredDocumentHeader` —el único camino por el que entra lo que viene
   * de Postgres o de IndexedDB— **lo descarta siempre**. Para que aparezca en un
   * `projects.doc_template` habría que escribirlo a mano saltándose ese parseo.
   */
  logoDataUrl?: string | null
  /**
   * Qué campos del catálogo de ISO 7200 se muestran, en orden. **No se guardan
   * las etiquetas**: salen traducidas del catálogo al resolver. Guardar el texto
   * dejaría plantillas en español dentro de proyectos en inglés, y un cambio de
   * nombre de campo en la norma habría que ir a corregirlo proyecto por proyecto.
   */
  fields: DocumentMetaField[]
}

/** Lo que se guarda en un proyecto que aún no ha definido cabecera. */
export const DEFAULT_STORED_DOCUMENT_HEADER: StoredDocumentHeader = {
  ...(({ logo: _logo, logoAspect: _aspect, rows: _rows, ...resto }) => resto)(DEFAULT_DOCUMENT_HEADER),
  logoImageId: null,
  fields: DEFAULT_DOCUMENT_HEADER.rows.map((r) => r.field),
}

/**
 * Convierte la plantilla guardada en la dibujable, resolviendo el logo.
 *
 * `loadLogo` devuelve el data URL de una imagen de la biblioteca, o `null`. Se
 * inyecta en vez de importarse para que este módulo no dependa del repositorio
 * y siga siendo probable sin red.
 *
 * Si el logo no se puede cargar **la cabecera se dibuja igual, sin él**: una
 * imagen que falta no puede impedir exportar un documento.
 */
export async function resolveDocumentHeader(
  stored: StoredDocumentHeader,
  loadLogo: (imageId: string) => Promise<string | null>,
  /**
   * Etiqueta corta de cada campo, ya traducida. Se inyecta —en vez de importar
   * i18next aquí— para que este módulo se pueda probar sin arrancar el idioma, y
   * para que el dibujado del PDF no dependa de la interfaz.
   */
  labelOf: (field: DocumentMetaField) => string,
  /**
   * Deja los bytes del logo en un formato que jsPDF dibuje bien y mide su
   * proporción real (`utils/logoImage.ts` → `prepareLogo`).
   *
   * **Se inyecta por la misma razón que las otras dos**: necesita `canvas` y un
   * decodificador de imágenes de verdad, que en las pruebas no hay. Sin él la
   * plantilla se resuelve igual y el logo va tal cual llegue — que es lo que
   * hacía antes, y por lo que salía roto.
   */
  prepareLogo?: (dataUrl: string) => Promise<{ dataUrl: string; aspect: number } | null>
): Promise<DocumentHeaderTemplate> {
  const { logoImageId, logoDataUrl, fields, ...resto } = stored
  let logo: string | null = null
  let logoAspect: number | undefined
  // Los bytes mandan sobre la referencia: si están, no hay biblioteca a la que
  // preguntar. Es el caso del diagrama suelto, y los dos nunca coexisten.
  if (logoDataUrl || logoImageId) {
    try {
      logo = logoDataUrl ?? (await loadLogo(logoImageId as string))
      if (logo && prepareLogo) {
        const listo = await prepareLogo(logo)
        // Si la preparación falla se conserva el original: peor un logo con la
        // proporción del estándar que ningún logo.
        if (listo) { logo = listo.dataUrl; logoAspect = listo.aspect }
      }
    } catch {
      logo = null
    }
  }
  return { ...resto, logo, logoAspect, rows: fields.map((field) => ({ field, label: labelOf(field) })) }
}

/**
 * Normaliza lo que venga de la base de datos. El `jsonb` puede traer cualquier
 * cosa —una versión antigua, un campo de menos, basura—, y una plantilla rota no
 * puede impedir abrir un proyecto.
 *
 * **NO LEE `logoDataUrl`, Y ESO ES UNA DEFENSA, NO UN OLVIDO.** Es el único
 * camino por el que entra una plantilla desde Postgres o IndexedDB. Descartar
 * aquí los bytes es lo que garantiza que un `projects.doc_template` no pueda
 * acabar con cientos de kB de base64 dentro, pase lo que pase aguas arriba. El
 * logo de un proyecto es y sigue siendo una **referencia** a la biblioteca.
 */
export function parseStoredDocumentHeader(raw: unknown): StoredDocumentHeader {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STORED_DOCUMENT_HEADER }
  const o = raw as Record<string, unknown>
  const cols = Array.isArray(o.columns) && o.columns.length === 3
    ? (o.columns.map((n) => (typeof n === 'number' && n > 0 ? n : 1)) as [number, number, number])
    : DEFAULT_STORED_DOCUMENT_HEADER.columns
  /**
   * `fields` es la forma actual. Se acepta también la anterior —`rows` con
   * etiqueta guardada— porque hubo plantillas así en el laboratorio: se toma el
   * campo y se tira la etiqueta, que ahora sale del catálogo.
   */
  const desdeFields = Array.isArray(o.fields)
    ? o.fields.filter((f): f is DocumentMetaField => typeof f === 'string')
    : null
  const desdeRows = Array.isArray(o.rows)
    ? o.rows
        .filter((r) => !!r && typeof r === 'object' && typeof (r as DocumentHeaderRow).field === 'string')
        .map((r) => (r as DocumentHeaderRow).field)
    : null
  const fields = desdeFields ?? desdeRows ?? DEFAULT_STORED_DOCUMENT_HEADER.fields
  return {
    enabled: o.enabled === true,
    height: typeof o.height === 'number' && o.height > 0 ? o.height : DEFAULT_STORED_DOCUMENT_HEADER.height,
    columns: cols,
    logoImageId: typeof o.logoImageId === 'string' && o.logoImageId ? o.logoImageId : null,
    titleField: (typeof o.titleField === 'string' ? o.titleField : 'title') as DocumentMetaField,
    fields,
    borderColor: typeof o.borderColor === 'string' ? o.borderColor : DEFAULT_STORED_DOCUMENT_HEADER.borderColor,
    textColor: typeof o.textColor === 'string' ? o.textColor : DEFAULT_STORED_DOCUMENT_HEADER.textColor,
    fontSize: typeof o.fontSize === 'number' && o.fontSize > 0 ? o.fontSize : DEFAULT_STORED_DOCUMENT_HEADER.fontSize,
  }
}

/**
 * Enciende o apaga el dibujado de una plantilla, **sin tocar la guardada**.
 *
 * LA PLANTILLA DICE *QUÉ* LLEVA LA CABECERA; QUIÉN DIBUJA DICE *SI* SE DIBUJA.
 * Desde que la casilla de exportar dejó de escribir `enabled` en la plantilla
 * del proyecto, **nadie lo pone en `true`**: nace apagado en
 * `DEFAULT_DOCUMENT_HEADER`, `parseStoredDocumentHeader` lo normaliza a `false`
 * y el panel de la plantilla solo emite `logo` y `fields`. Un `enabled` que
 * viene de la plantilla es, por construcción, siempre `false`.
 *
 * Eso vetaba las dos salidas —`documentHeaderHeight` devolvía 0 y
 * `drawDocumentHeader` salía en la primera línea—, así que la cabecera se veía
 * en la previsualización del diálogo (que ya hacía esto en local) y **no salía
 * ni en el PDF ni en el lienzo**. Ver EXP-023.
 *
 * Por eso cada consumidor pasa por aquí antes de medir o dibujar. Si algún día
 * `enabled` desaparece de `StoredDocumentHeader` —es dato muerto en
 * `projects.doc_template`—, esta función es el único sitio que hay que tocar.
 */
export function enableDocumentHeader(
  tpl: DocumentHeaderTemplate,
  draw: boolean
): DocumentHeaderTemplate {
  return { ...tpl, enabled: draw }
}

/** Anchos absolutos de las tres celdas para un ancho disponible dado. */
export function columnWidths(tpl: DocumentHeaderTemplate, availableWidth: number): [number, number, number] {
  const total = tpl.columns[0] + tpl.columns[1] + tpl.columns[2]
  if (!(total > 0) || !(availableWidth > 0)) return [0, 0, 0]
  const k = availableWidth / total
  const a = tpl.columns[0] * k
  const b = tpl.columns[1] * k
  // La tercera se calcula por resta para que la suma dé exacta y no quede una
  // rendija de medio milímetro por redondeo.
  return [a, b, availableWidth - a - b]
}

/**
 * Interlínea mínima de una fila de control, como múltiplo del cuerpo.
 *
 * 1,45 es lo que deja una línea de 8 pt (2,82 mm) respirando en 4,1 mm, que es
 * el mismo paso que usa el dibujado. Menos que esto y las filas se amontonan.
 */
const LINE_FACTOR = 1.45
/** Aire total —arriba y abajo— del recuadro, en mm. */
const BAND_PADDING = 3

/**
 * Alto que hay que reservar arriba. 0 si la cabecera está apagada.
 *
 * **CRECE CON LAS FILAS, y por eso no es una constante.** Los 18 mm del estándar
 * medido dan para tres filas; con las nueve del catálogo, el dibujado repartía
 * `(18 − 3) / 9 = 1,7 mm` por línea para un cuerpo de 8 pt —2,82 mm— y **las
 * filas se amontonaban unas sobre otras**, en la previsualización y en el PDF por
 * igual. Se vio activando todos los campos, que es exactamente la prueba que hay
 * que hacer.
 *
 * Lo que no hace es encoger el cuerpo para que quepan: un documento de control
 * con letra de 5 pt no sirve para nada. La cabecera ocupa lo que necesita, el
 * diagrama se queda con el resto, y quien elige nueve campos **ve el precio** en
 * la hoja y en el panel de la plantilla.
 */
export function documentHeaderHeight(tpl: DocumentHeaderTemplate): number {
  if (!tpl.enabled) return 0
  const linea = tpl.fontSize * MM_PER_POINT * LINE_FACTOR
  const necesario = tpl.rows.length * linea + BAND_PADDING
  return Math.max(0, Math.max(tpl.height, necesario))
}

/**
 * Aire alrededor del logo dentro de su celda, en mm.
 *
 * Se exporta porque **la previsualización tiene que dejar el mismo**. Con la
 * celda a 18 mm de alto, 2 mm por lado son casi la cuarta parte: una vista que
 * no los descuente enseña el logo un cuarto más grande de lo que saldrá.
 */
export const LOGO_PADDING = 2

/**
 * Encaja un logo dentro de una celda conservando su proporción y dejando aire.
 * Devuelve el rectángulo donde dibujarlo, centrado.
 */
export function fitLogo(
  cell: { x: number; y: number; width: number; height: number },
  logoAspect: number,
  padding = LOGO_PADDING
): { x: number; y: number; width: number; height: number } {
  const maxW = Math.max(0, cell.width - padding * 2)
  const maxH = Math.max(0, cell.height - padding * 2)
  if (!(maxW > 0) || !(maxH > 0) || !(logoAspect > 0)) {
    return { x: cell.x, y: cell.y, width: 0, height: 0 }
  }
  let w = maxW
  let h = w / logoAspect
  if (h > maxH) {
    h = maxH
    w = h * logoAspect
  }
  return { x: cell.x + (cell.width - w) / 2, y: cell.y + (cell.height - h) / 2, width: w, height: h }
}

export interface DrawDocumentHeaderOptions {
  tpl: DocumentHeaderTemplate
  meta: DocumentMeta
  /** Nombre del diagrama: se usa como título si el campo `title` está vacío. */
  fallbackTitle?: string
  /** Márgenes y ancho de la hoja, en mm. */
  margin: number
  pageWidth: number
  /**
   * Proporción ancho/alto del logo. Solo para forzarla desde fuera; lo normal es
   * que venga en la plantilla, medida al preparar la imagen.
   */
  logoAspect?: number
}

/**
 * Proporción de reserva: la del logo del `.docx` que se midió para las columnas.
 *
 * **Es un último recurso, no un valor por defecto.** Aplicarla a un logo que no
 * tiene esa forma lo estira, que es lo que pasaba cuando nadie medía el de
 * verdad. Solo se usa si la preparación de la imagen no llegó a ejecutarse.
 */
const FALLBACK_LOGO_ASPECT = 20.4 / 12.1

/**
 * Dibuja la cabecera arriba de la hoja.
 *
 * No devuelve nada: el hueco ya lo reservó `PageSpec.headerHeight`, y quien
 * compone la página se encarga de que el diagrama caiga debajo.
 */
export function drawDocumentHeader(pdf: jsPDF, opts: DrawDocumentHeaderOptions): void {
  const { tpl, meta, margin, pageWidth, fallbackTitle } = opts
  if (!tpl.enabled) return

  const width = pageWidth - margin * 2
  if (!(width > 0)) return
  const height = documentHeaderHeight(tpl)
  const [w0, w1] = columnWidths(tpl, width)
  const x = margin
  const y = margin

  pdf.setDrawColor(tpl.borderColor)
  pdf.setLineWidth(0.3)
  pdf.rect(x, y, width, height)
  pdf.line(x + w0, y, x + w0, y + height)
  pdf.line(x + w0 + w1, y, x + w0 + w1, y + height)

  pdf.setTextColor(tpl.textColor)

  // Celda 1 — logo. Si no hay, la celda queda vacía a propósito: no se inventa
  // ningún texto de relleno.
  if (tpl.logo) {
    const caja = fitLogo(
      { x, y, width: w0, height },
      opts.logoAspect ?? tpl.logoAspect ?? FALLBACK_LOGO_ASPECT
    )
    if (caja.width > 0) {
      try {
        // `prepareLogo` deja siempre PNG, y el resto se lo dice a jsPDF la
        // cabecera del binario: husmea el formato real e ignora esta pista si
        // no coincide. La pista solo cuenta cuando no reconoce nada.
        pdf.addImage(tpl.logo, 'PNG', caja.x, caja.y, caja.width, caja.height)
      } catch {
        // Un logo ilegible no puede tumbar una exportación.
      }
    }
  }

  // Celda 2 — título, centrado y en negrita, como en el estándar.
  const titulo = (meta[tpl.titleField] || fallbackTitle || '').trim()
  if (titulo) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(tpl.fontSize + 2)
    pdf.text(titulo, x + w0 + w1 / 2, y + height / 2 + 1, {
      align: 'center',
      maxWidth: w1 - 4,
    })
  }

  // Celda 3 — las filas de control, una debajo de otra.
  const filas = tpl.rows.filter((r) => (meta[r.field] ?? '').trim() !== '')
  if (filas.length) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(tpl.fontSize)
    const paso = Math.min(4.2, (height - 3) / filas.length)
    const inicio = y + height / 2 - ((filas.length - 1) * paso) / 2 + 0.8
    filas.forEach((r, i) => {
      pdf.setFont('helvetica', 'bold')
      pdf.text(r.label, x + w0 + w1 + 2, inicio + i * paso)
      pdf.setFont('helvetica', 'normal')
      pdf.text(meta[r.field].trim(), x + w0 + w1 + 2 + pdf.getTextWidth(r.label) + 1.5, inicio + i * paso)
    })
  }

  pdf.setFont('helvetica', 'normal')
}
