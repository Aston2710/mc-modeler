/**
 * localDocumentHeader.ts — la cabecera del diagrama que no está en un proyecto.
 *
 * POR QUÉ EXISTE. Hasta ahora un diagrama suelto veía la cabecera **a medias**:
 * podía rellenar los campos que la plantilla ya traía y nada más — ni logo, ni
 * elegir qué campos salen. El panel se lo decía con un cartel: *«la cabecera se
 * define en el proyecto»*. Correcto como descripción del código y malo como
 * producto: el estudiante, el consultor suelto o quien está probando la
 * herramienta son exactamente quienes no tienen proyecto.
 *
 * PLAN-034 ya lo había decidido en D-C —cascada **usuario → proyecto →
 * diagrama**, con el nivel de usuario como valor por defecto para quien trabaja
 * fuera de un proyecto—. Esto es ese nivel.
 *
 * POR QUÉ EN `localStorage` Y NO EN `UserPreferences`. Mismo motivo que
 * `exportPreferences.ts`: las preferencias de usuario viajan por el repositorio,
 * y en la nube son **una fila de producción**. Añadirles un campo es un cambio de
 * esquema, y meterles un logo en base64 sería además cargar una fila que se lee
 * al arrancar. Aquí no hace falta: la plantilla de un diagrama suelto no la
 * comparte nadie, porque un diagrama suelto no lo comparte nadie.
 *
 * EL LOGO VA POR VALOR, NO POR REFERENCIA, Y NO HAY OTRA OPCIÓN. La biblioteca
 * de imágenes es **por proyecto**: sin proyecto no hay dónde referenciar. Así que
 * se guardan los bytes, uno solo —el actual—, y se sustituyen al cambiarlo. No
 * hay historial ni galería: no es una biblioteca, es *este* logo.
 *
 * SE VALIDA AL LEER, SIEMPRE. `localStorage` es texto que puede haber escrito
 * cualquiera. Lo que no encaja se descarta y se usa el valor por defecto.
 */
import {
  DEFAULT_STORED_DOCUMENT_HEADER,
  parseStoredDocumentHeader,
  type StoredDocumentHeader,
} from './documentHeader'

/** La `v1` es deliberada: cambiar la forma no obliga a migrar, basta con subirla. */
const KEY = 'mc-modeler.docheader.v1'

/**
 * Tope del logo guardado, en caracteres del data URL (~1 MB).
 *
 * `localStorage` da unos 5 MB **para todo el origen**, compartidos con las
 * preferencias de exportación y con lo que venga después. `prepareLogo` ya
 * limita el lado mayor a 512 px, así que un logo normal pesa muy por debajo;
 * este tope es para el caso raro —una foto con mucho detalle— y existe para que
 * el fallo sea **un aviso**, no una escritura que revienta la cuota y se lleva
 * por delante lo que ya había guardado.
 */
export const MAX_LOCAL_LOGO_CHARS = 1_000_000

/**
 * La plantilla del diagrama suelto. Nunca `null`: si no hay nada guardado, la
 * neutra —apagada, sin logo y sin nombrar a nadie—, igual que un proyecto que
 * aún no ha definido cabecera.
 */
export function loadLocalDocumentHeader(): StoredDocumentHeader {
  let raw: unknown = null
  try {
    const txt = localStorage.getItem(KEY)
    raw = txt ? JSON.parse(txt) : null
  } catch {
    // Modo privado, cuota agotada, JSON corrupto: no hay nada que recordar.
    return { ...DEFAULT_STORED_DOCUMENT_HEADER }
  }

  // Todo lo que NO es el logo se valida con el mismo parseo que lo que viene de
  // la base de datos: una sola definición de qué es una plantilla válida.
  const base = parseStoredDocumentHeader(raw)

  // El logo se valida aquí porque `parseStoredDocumentHeader` lo descarta a
  // propósito — es su defensa para que no entre en `projects.doc_template`.
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const logo = o.logoDataUrl
  const valido =
    typeof logo === 'string' &&
    logo.startsWith('data:image/') &&
    logo.length <= MAX_LOCAL_LOGO_CHARS

  return { ...base, logoImageId: null, logoDataUrl: valido ? (logo as string) : null }
}

/**
 * Guarda la plantilla del diagrama suelto.
 *
 * Devuelve `false` si el navegador no dejó escribir —sin sitio, sin permiso, modo
 * privado—, para que quien llame pueda decirlo. **Aquí sí importa saberlo**: a
 * diferencia de recordar el último tamaño de hoja, esto es una configuración que
 * el usuario acaba de componer, y perderla en silencio sería mentirle.
 */
export function saveLocalDocumentHeader(tpl: StoredDocumentHeader): boolean {
  try {
    // `logoImageId` no viaja: sin proyecto no hay biblioteca a la que apuntar, y
    // guardarlo dejaría una referencia colgando que nadie puede resolver.
    const { logoImageId: _ref, ...resto } = tpl
    localStorage.setItem(KEY, JSON.stringify(resto))
    return true
  } catch {
    return false
  }
}
