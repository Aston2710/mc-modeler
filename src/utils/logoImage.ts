/**
 * logoImage.ts — el logo del cajetín, preparado para que el PDF no lo destroce.
 *
 * POR QUÉ EXISTE ESTE MÓDULO. El logo salía en el PDF como un rectángulo negro
 * con la forma rota a trozos. No era el logo del usuario: era **el decodificador
 * de WebP de jsPDF**.
 *
 * La cadena que lo produce, leída en el fuente de jsPDF 3 (`processWEBP`):
 *
 * 1. `utils/imageCompress.ts` guarda TODA la biblioteca en **WebP con canal
 *    alfa** (`canvas.toDataURL('image/webp', 0.9)`). Es la decisión correcta para
 *    la biblioteca —pesa la mitad y el egress es el recurso escaso—, pero afecta
 *    también al logo.
 * 2. `addImage` husmea las cabeceras del binario, detecta `RIFF…WEBP` y entra
 *    por `processWEBP`.
 * 3. Y ahí está el fallo: `processWEBP` decodifica a RGBA y **lo vuelve a
 *    codificar como JPEG** antes de meterlo en el PDF. **El JPEG no tiene canal
 *    alfa.** Cada píxel transparente —que en un lienzo viene como (0,0,0,0)— se
 *    escribe como negro opaco. Un logo transparente sale como una mancha negra
 *    con la forma recortada en negativo, que es exactamente lo que se veía.
 *
 * De propina, ese mismo camino empalma a mano el chunk `ALPH` con el `VP8` antes
 * de decodificar, y el tamaño que calcula deja los bordes sucios. Da igual: con
 * el alfa perdido el logo ya era irreconocible.
 *
 * LA SEGUNDA AVERÍA, MÁS SILENCIOSA. `drawDocumentHeader` encajaba el logo con
 * una proporción **fija de 20.4/12.1** porque nadie le pasaba la real: la del
 * `.docx` que se midió para las columnas. Un logo cuadrado salía estirado a
 * 1.69:1. Las dos averías se sumaban, y por eso la imagen no se reconocía.
 *
 * QUÉ HACE EL ARREGLO. Decodificar con el navegador —que sabe de WebP, PNG, JPEG
 * y SVG— y **re-codificar a PNG**. Al PNG jsPDF lo trata bien: `processAlphaPNG`
 * saca el alfa a un `/SMask` del PDF, así que la transparencia se conserva de
 * verdad en vez de aplanarse a negro. De paso el decodificado da el **tamaño
 * real**, que es lo que arregla la proporción.
 *
 * El coste es despreciable: el logo se prepara una vez al abrir el proyecto, no
 * en cada exportación.
 */

/** Un logo listo para `addImage`, con su geometría medida. */
export interface PreparedLogo {
  /** PNG re-codificado por el navegador. Formato que jsPDF trata bien. */
  dataUrl: string
  /** Ancho / alto reales. Es lo que `fitLogo` necesita para no deformarlo. */
  aspect: number
  width: number
  height: number
}

/**
 * Lado mayor al que se re-codifica, en píxeles.
 *
 * La celda del logo mide ~20 mm de ancho; a 300 ppp eso son 236 px. 512 deja
 * margen de sobra para imprimir y para que alguien amplíe en el visor, y evita
 * meter en el PDF un original de 2048 px que nadie va a ver a ese tamaño.
 */
const MAX_SIDE = 512

/** Lo que se asume si el navegador no declara tamaño (SVG sin `width`). */
const FALLBACK_SIDE = 300

/** Decodifica una imagen con el navegador. Rechaza si no puede. */
export function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Solo hace falta para orígenes remotos; con `data:` es indiferente. Sin
    // esto, un logo servido por URL contaminaría el lienzo y `toDataURL`
    // lanzaría un error de seguridad.
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo decodificar la imagen'))
    img.src = src
  })
}

/**
 * Deja el logo en PNG y mide su proporción real.
 *
 * Devuelve `null` si no se puede preparar. **Nunca lanza**: un logo ilegible no
 * puede impedir exportar un documento, igual que en `resolveDocumentHeader`.
 *
 * La transparencia **se conserva**: el lienzo no se rellena con ningún color de
 * fondo. Un logo transparente debe verse igual sobre una hoja blanca que sobre
 * una oscura, y rellenarlo aquí le pondría un recuadro blanco en el tema oscuro.
 */
export async function prepareLogo(source: string | null): Promise<PreparedLogo | null> {
  if (!source) return null
  try {
    const img = await decodeImage(source)
    const natW = img.naturalWidth || img.width || FALLBACK_SIDE
    const natH = img.naturalHeight || img.height || FALLBACK_SIDE
    if (!(natW > 0) || !(natH > 0)) return null

    const k = Math.min(1, MAX_SIDE / Math.max(natW, natH))
    const w = Math.max(1, Math.round(natW * k))
    const h = Math.max(1, Math.round(natH * k))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)

    // La proporción sale del ORIGINAL, no del lienzo: el redondeo a entero de
    // píxel desplazaría la proporción unas milésimas, y sobre 20 mm eso se ve.
    return { dataUrl: canvas.toDataURL('image/png'), aspect: natW / natH, width: natW, height: natH }
  } catch {
    return null
  }
}

/**
 * Lee un fichero elegido por el usuario y lo deja como PNG para usarlo de logo.
 *
 * **PNG SIN PÉRDIDA, no el WebP de la biblioteca.** Un logo es tipografía y
 * bordes limpios: es justo el contenido que el WebP con pérdida ensucia con halos
 * a 0.9 de calidad. Pesa más, pero un logo son unos pocos kB y se sube una vez
 * por proyecto.
 *
 * Lanza si el fichero no es una imagen que el navegador sepa decodificar, para
 * que quien lo llame pueda decirlo.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
  const prepared = await prepareLogo(source)
  if (!prepared) throw new Error('El archivo no es una imagen válida')
  return prepared.dataUrl
}
