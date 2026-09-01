/**
 * Lo último que se eligió al exportar, recordado en el navegador.
 *
 * POR QUÉ NO VA EN `UserPreferences`. Las preferencias de usuario viajan por el
 * repositorio —IndexedDB o Supabase—, y en la nube son una fila de producción:
 * añadir un campo ahí es un cambio de esquema. Esto no lo merece. Es una
 * comodidad de una sola máquina —«la última vez exporté en A3 apaisado»— y no
 * hay nada que se pierda si el navegador la olvida.
 *
 * SE VALIDA AL LEER, SIEMPRE. `localStorage` es texto que puede haber escrito
 * cualquiera: una versión anterior de la app, otra pestaña, o alguien a mano en
 * la consola. Un `margin` que llegue como `"NaN"` o un `size` inventado saldría
 * a la aritmética de la hoja y la previsualización mentiría. Lo que no encaja se
 * descarta en silencio y se usa el valor por defecto.
 */
import { PAGE_SIZES, type PageSizeId, type PageOrientation } from './pageLayout'

export type RememberedTheme = 'current' | 'light' | 'dark'

export interface RememberedExport {
  size: PageSizeId
  orientation: PageOrientation
  margin: number
  rotateDiagram: boolean
  theme: RememberedTheme
  pngScale: 1 | 2 | 3
  /**
   * Si se incluye la cabecera de documento.
   *
   * **Nace apagada**: sin nada recordado no hay cabecera. Un documento con
   * cabecera es una decisión, no un valor por defecto — y quien no la quiere no
   * tiene que ir a quitarla cada vez.
   */
  includeHeader: boolean
  /** Secciones del inspector que quedaron abiertas. */
  openSections: string[]
}

/** Los márgenes que ofrece la interfaz. Cualquier otro valor no vino de aquí. */
const MARGINS = [25.4, 12.7, 6]
const THEMES: RememberedTheme[] = ['current', 'light', 'dark']
const SCALES = [1, 2, 3]

/** La `v1` es deliberada: cambiar la forma no obliga a migrar, basta con subirla. */
const KEY = 'mc-modeler.export.v1'

function readRaw(): Record<string, unknown> | null {
  try {
    const txt = localStorage.getItem(KEY)
    if (!txt) return null
    const val: unknown = JSON.parse(txt)
    return val && typeof val === 'object' ? (val as Record<string, unknown>) : null
  } catch {
    // Modo privado, cuota agotada, JSON corrupto: no hay nada que recordar.
    return null
  }
}

/**
 * Lo recordado, campo a campo. Devuelve solo lo que ha pasado la validación, de
 * modo que el llamador puede hacer `{ ...susValoresPorDefecto, ...recordado }`.
 */
export function loadExportPreferences(): Partial<RememberedExport> {
  const raw = readRaw()
  if (!raw) return {}
  const out: Partial<RememberedExport> = {}

  if (typeof raw.size === 'string' && raw.size in PAGE_SIZES) out.size = raw.size as PageSizeId
  if (raw.orientation === 'portrait' || raw.orientation === 'landscape') out.orientation = raw.orientation
  if (typeof raw.margin === 'number' && MARGINS.includes(raw.margin)) out.margin = raw.margin
  if (typeof raw.rotateDiagram === 'boolean') out.rotateDiagram = raw.rotateDiagram
  if (typeof raw.theme === 'string' && THEMES.includes(raw.theme as RememberedTheme)) {
    out.theme = raw.theme as RememberedTheme
  }
  if (typeof raw.pngScale === 'number' && SCALES.includes(raw.pngScale)) {
    out.pngScale = raw.pngScale as 1 | 2 | 3
  }
  if (typeof raw.includeHeader === 'boolean') out.includeHeader = raw.includeHeader
  if (Array.isArray(raw.openSections)) {
    out.openSections = raw.openSections.filter((s): s is string => typeof s === 'string')
  }
  return out
}

/** Guarda lo elegido. Si el navegador no deja escribir, no pasa nada. */
export function saveExportPreferences(prefs: Partial<RememberedExport>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadExportPreferences(), ...prefs }))
  } catch {
    // Sin sitio o sin permiso: recordar es un lujo, no un requisito.
  }
}
