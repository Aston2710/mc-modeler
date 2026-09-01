/**
 * Forja de thumbnails — renderizador headless para el backfill de PLAN-012.
 *
 * SOLO existe en `npm run lab`. `main.tsx` lo carga detras de
 * `import.meta.env.MODE === 'lab'`, que Vite sustituye por una constante al
 * compilar: en el build de produccion la rama es inalcanzable y rollup descarta
 * este modulo entero. Ni una linea llega al bundle real.
 *
 * POR QUE EXISTE. El paso 1 de PLAN-012 rasteriza el thumbnail al guardar, pero
 * eso solo actua sobre lo que alguien vuelva a guardar. Los thumbnails que ya
 * estaban en el bucket siguen siendo SVG, y por RLS ninguna sesion de navegador
 * ve todos los diagramas: hace falta un pase con `service_role`, o sea un
 * script. Ese script (`scripts/backfill-thumbs.mjs`) trae el XML y sube el
 * resultado, pero necesita algo que RENDERICE, y renderizar BPMN necesita un
 * DOM. Esta es esa pieza.
 *
 * POR QUE DENTRO DE LA APP Y NO UN VIEWER SUELTO. Se penso usar el UMD de
 * `bpmn-navigated-viewer` en una pagina en blanco, que habria sido mas simple, y
 * es una via equivocada: el SVG de esta app no lo produce un bpmn-js pelado,
 * sino un Modeler con los 26 modulos de `MODELER_CONFIG` —entre ellos
 * `ThemeAwareRendererModule`, `PhaseModule` y `StickyLaneLabelsModule`— mas la
 * extension de moddle `flujo`, y ademas `getThemedSvg` lee los tokens del CSSOM
 * vivo. Un viewer pelado habria devuelto diagramas sin colores de fase ni de
 * grupo, sin etiquetas ancladas, y perdiendo los atributos `flujo:`.
 *
 * Los thumbnails reconvertidos habrian salido DISTINTOS de los que genera la
 * app, y la diferencia solo se habria visto al mirarlos uno a uno. Usando el
 * mismo `MODELER_CONFIG`, el mismo `topPoolCrop` y el mismo `buildThumbnail`, la
 * salida es la del camino real de guardado.
 */
// @ts-ignore — bpmn-js es CommonJS con tipos incompletos
import BpmnModeler from 'bpmn-js/lib/Modeler'
import { MODELER_CONFIG } from '@/bpmn/config'
import {
  buildThumbnail, buildThumbnailSvg, svgToWebp, svgToDataUrl, topPoolCrop,
  thumbTargetBox, THUMB_BOX, THUMB_QUALITY, THUMB_SUPERSAMPLE,
} from '@/utils/thumbnailUtils'
import { getThemedSvg } from '@/hooks/useExport'
import { renderDiagramPdf, svgViewBox } from '@/utils/pdfDocument'
import {
  DEFAULT_PAGE_SPEC, fitScale, labelPointSize, type PageSpec,
} from '@/utils/pageLayout'
import {
  DEFAULT_DOCUMENT_HEADER, drawDocumentHeader, documentHeaderHeight, type DocumentHeaderTemplate,
} from '@/utils/documentHeader'
import { EMPTY_DOCUMENT_META, type DocumentMeta } from '@/bpmn/elements/documentMeta'

export interface ForgeResult {
  dataUrl: string
  mime: string
  /** Bytes reales del blob, ya descontado el inflado de base64. */
  bytes: number
  /** `true` si hubo que caer al SVG — el llamador debe tratarlo como fallo. */
  fellBackToSvg: boolean
  /** Ajustes con los que se generó, para poder etiquetar comparativas. */
  ajustes: { dpr: number; quality: number; supersample: number; width: number; height: number }
}

/**
 * Ajustes alternativos para una comparativa. Sin ellos se usa exactamente lo que
 * usa la app, que es lo que debe correr en un backfill de verdad.
 */
export interface ForgeOverrides {
  dpr?: number
  quality?: number
  supersample?: number
}

export interface ForgePdfResult {
  /** El PDF en base64, para que el script lo escriba a disco y lo inspeccione. */
  base64: string
  bytes: number
  /** Escala de encaje en mm por unidad, y el tamaño de letra que produce. */
  scale: number
  pointSize: number
  diagram: { width: number; height: number }
}

interface ForgeApi {
  render(xml: string, overrides?: ForgeOverrides): Promise<ForgeResult>
  /**
   * Compone el PDF por el camino REAL de la app (`renderDiagramPdf`), para poder
   * verificar la salida vectorial contra diagramas de produccion sin pasar por
   * la interfaz. PLAN-034 fase 1.
   */
  renderPdf(
    xml: string,
    spec?: Partial<PageSpec>,
    cabecera?: { tpl?: Partial<DocumentHeaderTemplate>; meta?: Partial<DocumentMeta>; titulo?: string }
  ): Promise<ForgePdfResult>
  target(): { width: number; height: number; quality: number; supersample: number; dpr: number }
  dispose(): void
}

// bpmn-js es CommonJS con tipos incompletos: el Modeler no tiene declaración
// utilizable, igual que en `modelerCache.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modeler: any = null
let host: HTMLDivElement | null = null

/**
 * Un unico Modeler para todo el pase. Crear y destruir uno por diagrama
 * multiplicaba por seis el tiempo del backfill sin cambiar el resultado: el
 * estado que importa lo reemplaza `importXML` entero en cada llamada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureModeler(): any {
  if (modeler) return modeler
  host = document.createElement('div')
  // Fuera de la vista pero CON tamano: un contenedor de 0×0 hace que bpmn-js
  // calcule un viewbox degenerado y el SVG sale vacio.
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1600px;height:1200px;pointer-events:none;'
  document.body.appendChild(host)
  modeler = new BpmnModeler({ ...MODELER_CONFIG, container: host })
  return modeler
}

/**
 * La densidad que usa la app hoy, derivada de la caja objetivo en vez de
 * importar `THUMB_DPR`: asi no puede quedar desincronizada si alguien cambia
 * `thumbTargetBox()`.
 */
const THUMB_DPR_EFECTIVO = thumbTargetBox().width / THUMB_BOX.width

function base64Bytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (!dataUrl.slice(0, dataUrl.indexOf(',')).includes(';base64')) {
    return new TextEncoder().encode(decodeURIComponent(payload)).length
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

const api: ForgeApi = {
  async render(xml: string, overrides?: ForgeOverrides): Promise<ForgeResult> {
    const m = ensureModeler()
    await m.importXML(xml)

    const getSvg = async () => (await m.saveSVG()).svg
    const getCrop = () => topPoolCrop(m.get('elementRegistry'))

    const dpr = overrides?.dpr ?? THUMB_DPR_EFECTIVO
    const quality = overrides?.quality ?? THUMB_QUALITY
    const supersample = overrides?.supersample ?? THUMB_SUPERSAMPLE
    const box = { width: THUMB_BOX.width * dpr, height: THUMB_BOX.height * dpr }

    let dataUrl: string
    if (!overrides) {
      // Sin overrides se llama al camino REAL de la app, tal cual. Es lo que
      // debe correr en un backfill: nada de una ruta paralela que pueda
      // divergir del guardado normal.
      dataUrl = await buildThumbnail(getSvg, getCrop)
    } else {
      // Con overrides se recomponen los dos pasos para poder variar las
      // perillas. Son las MISMAS funciones, solo con otros argumentos.
      const svg = await buildThumbnailSvg(getSvg, getCrop)
      dataUrl = (await svgToWebp(svg, box, quality, supersample)) ?? svgToDataUrl(svg)
    }

    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'desconocido'
    return {
      dataUrl,
      mime,
      bytes: base64Bytes(dataUrl),
      fellBackToSvg: mime === 'image/svg+xml',
      ajustes: { dpr, quality, supersample, width: box.width, height: box.height },
    }
  },

  async renderPdf(
    xml: string,
    spec?: Partial<PageSpec>,
    cabecera?: { tpl?: Partial<DocumentHeaderTemplate>; meta?: Partial<DocumentMeta>; titulo?: string }
  ): Promise<ForgePdfResult> {
    const m = ensureModeler()
    await m.importXML(xml)

    const tpl: DocumentHeaderTemplate = { ...DEFAULT_DOCUMENT_HEADER, ...cabecera?.tpl }
    const meta: DocumentMeta = { ...EMPTY_DOCUMENT_META, ...cabecera?.meta }
    const completo: PageSpec = {
      ...DEFAULT_PAGE_SPEC,
      ...spec,
      headerHeight: documentHeaderHeight(tpl),
    }
    // El mismo SVG temado que usa la exportación real.
    const svg = await getThemedSvg('light', async () => (await m.saveSVG()).svg)
    const blob = await renderDiagramPdf(svg, {
      spec: completo,
      background: '#ffffff',
      drawHeader: (pdf, page) =>
        drawDocumentHeader(pdf, {
          tpl, meta,
          fallbackTitle: cabecera?.titulo ?? '',
          margin: completo.margin,
          pageWidth: page.width,
        }),
    })

    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])

    const caja = svgViewBox(svg)
    const escala = fitScale(completo, caja.width, caja.height)
    return {
      base64: btoa(bin),
      bytes: buf.length,
      scale: escala,
      pointSize: labelPointSize(escala),
      diagram: { width: caja.width, height: caja.height },
    }
  },

  target() {
    const box = thumbTargetBox()
    return {
      ...box,
      quality: THUMB_QUALITY,
      supersample: THUMB_SUPERSAMPLE,
      dpr: THUMB_DPR_EFECTIVO,
    }
  },

  dispose() {
    try {
      modeler?.destroy()
    } catch {
      /* da igual: el proceso se va a cerrar */
    }
    host?.remove()
    modeler = null
    host = null
  },
}

declare global {
  interface Window {
    __thumbForge?: ForgeApi
  }
}

export function installThumbForge(): void {
  window.__thumbForge = api
}
