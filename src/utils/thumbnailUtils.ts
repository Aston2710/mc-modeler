// src/utils/thumbnailUtils.ts
import { getThemedSvg } from '@/hooks/useExport'
import { setSvgPixelSize } from '@/utils/svgRaster'

/** Recorte en coordenadas de diagrama (las mismas del viewBox de saveSVG). */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

const CROP_MARGIN = 10

/**
 * Si el diagrama tiene 2+ pools, devuelve el bounding box del pool superior
 * (menor `y`) para usarlo como recorte del thumbnail — un solo pool como
 * imagen representativa en vez del diagrama completo encogido.
 * Con 0-1 pools devuelve null (thumbnail del diagrama completo).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function topPoolCrop(registry: any): CropRect | null {
  if (typeof registry?.filter !== 'function') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pools = registry.filter((el: any) =>
    el?.businessObject?.$type === 'bpmn:Participant' && !el.labelTarget && el.width > 0)
  if (pools.length < 2) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const top = pools.reduce((a: any, b: any) => (b.y < a.y ? b : a))
  return {
    x: top.x - CROP_MARGIN,
    y: top.y - CROP_MARGIN,
    width: top.width + CROP_MARGIN * 2,
    height: top.height + CROP_MARGIN * 2,
  }
}

/**
 * Caja de presentación más grande donde se pinta un thumbnail, en px CSS:
 * `.diagram-thumb` de la portada (ancho de tarjeta ~300, alto fijo 140). Las
 * otras dos vistas se sirven del mismo fichero y son más pequeñas
 * (`.pv-grid-thumb` 180×110, `.pv-lr-thumb` 48×32), así que basta cubrir esta.
 *
 * Las tres usan `object-fit: contain`, que es la misma operación que hace
 * `svgToWebp` al calcular la escala. Por eso el ráster cae a 1:1 en píxeles
 * físicos y no lo re-escala el navegador.
 */
export const THUMB_BOX = { width: 300, height: 140 }
/**
 * Densidad objetivo: la caja CSS se multiplica por esto para obtener el ráster.
 *
 * **4× → 1200×560, ~27 kB.** Elegido a ojo el 2026-08-22 comparando las seis
 * variantes en el banco de pruebas del laboratorio (`src/lab/ThumbLab.tsx`)
 * sobre un diagrama denso de varios carriles.
 *
 * Con 3× (900×420, ~14 kB) la tarjeta ya está cubierta en cualquier pantalla,
 * así que este cuarto multiplicador **no se nota en la tarjeta**: se paga para
 * que el thumbnail siga siendo legible al mirarlo suelto. Es el doble de bytes
 * por miniatura, y la única razón para no bajarlo es que se decidió mirando.
 *
 * Si algún día pesa demasiado, bajar a 3 es seguro y no degrada la tarjeta.
 */
export const THUMB_DPR = 4
/**
 * Calidad WebP. El dibujo de líneas necesita más que una foto: por debajo de
 * ~0.9 el códec deja halos alrededor de los trazos de 1 px negro sobre blanco.
 * Sube muy poco el peso porque los colores planos comprimen muy bien.
 */
export const THUMB_QUALITY = 0.92
/**
 * Factor de supermuestreo: se rasteriza a este múltiplo del tamaño final y se
 * reduce con suavizado alto.
 *
 * En la tarjeta ya estamos en el techo de resolución (300×140 CSS a densidad 3
 * son exactamente los 900×420 que producimos), asi que subir pixeles no la haria
 * mas nitida. Lo que si mejora es COMO se resuelve el detalle en los pixeles que
 * hay: reduciendo desde el doble, cada pixel final se promedia de cuatro en vez
 * de decidirse de uno, y los trazos de 1 px y el texto pequeño quedan mucho
 * mejor definidos.
 *
 * **El fichero final no cambia de tamaño ni de peso**: solo se paga un lienzo
 * intermedio de 4× pixeles al guardar, que son milisegundos. A 2× son 1800×840,
 * 1.5 Mpx — irrelevante para el navegador.
 *
 * Subirlo a 3 o 4 tiene rendimientos rápidamente decrecientes: el promediado ya
 * satura, y el coste crece al cuadrado.
 */
export const THUMB_SUPERSAMPLE = 2

/**
 * Genera el thumbnail de un diagrama, rasterizado a WebP.
 *
 * POR QUÉ RASTERIZADO (PLAN-012). Antes esto devolvía el SVG del diagrama
 * entero como data URL. Un BPMN vectorial es el peor formato posible para una
 * miniatura: viajaban 36 kB de mediana y hasta 433 kB —cada forma, cada
 * etiqueta, cada path— y el navegador tenía que parsear el XML y rasterizar el
 * diagrama completo **en cada render de cada tarjeta**, en el hilo principal.
 * Con 78 tarjetas en la portada eso son ~4 MB y 78 rasterizados.
 *
 * Rasterizar aquí mueve ese trabajo de tiempo-de-lectura a tiempo-de-escritura:
 * se paga una vez al guardar, no una vez por visita de cada usuario. Y el peso
 * pasa a ser casi constante (~20-30 kB a 3×), porque ya no depende de la
 * complejidad del diagrama: los diagramas grandes dejan de ser los lentos.
 *
 * EFECTO SECUNDARIO DE PRIVACIDAD, deliberado. Un SVG lleva dentro el texto
 * completo del proceso —nombres de tareas, decisiones— seleccionable y
 * extraíble; es la razón de que su acceso esté atado 1:1 al del diagrama
 * (migración `0029`). Rasterizado, ese texto son píxeles: sigue siendo legible
 * a la vista, pero deja de poder extraerse o indexarse.
 *
 * Otras propiedades que se conservan del comportamiento anterior:
 * - Siempre en tema light, para que la vista previa no dependa del tema activo.
 * - `getThemedSvg` remapea colores sobre el string exportado, sin re-renderizar
 *   el canvas: no hay parpadeo de tema al guardar.
 * - `getCrop` recorta al pool superior en diagramas multi-pool.
 *
 * Si el rasterizado no está disponible (jsdom en pruebas, canvas bloqueado,
 * navegador sin WebP), cae al data URL SVG de siempre. Peor rendimiento, pero
 * nunca se queda sin thumbnail.
 */
export async function buildThumbnail(
  getSvg: () => Promise<string>,
  getCrop?: () => CropRect | null
): Promise<string> {
  const svg = await buildThumbnailSvg(getSvg, getCrop)
  try {
    const raster = await svgToWebp(svg, thumbTargetBox(), THUMB_QUALITY)
    if (raster) return raster
  } catch {
    /* cae al SVG */
  }
  return svgToDataUrl(svg)
}

/** El SVG temado, recortado y con viewBox — el paso previo al rasterizado. */
export async function buildThumbnailSvg(
  getSvg: () => Promise<string>,
  getCrop?: () => CropRect | null
): Promise<string> {
  // 1. SVG con colores light + background blanco + color de texto inyectados
  const themedSvg = await getThemedSvg('light', getSvg)

  // 2. Añadir viewBox si no existe — necesario para que object-fit: contain funcione
  let svg = ensureViewBox(themedSvg)

  // 3. Recorte opcional (pool superior en diagramas multi-pool)
  const crop = getCrop?.() ?? null
  if (crop) svg = applyCrop(svg, crop)

  // 4. El rect de fondo inyectado usa width/height 100% desde (0,0); si el
  //    viewBox no arranca en el origen (saveSVG usa coords de diagrama, y el
  //    recorte también), no cubre todo. Anclarlo al viewBox real.
  return anchorBackgroundRect(svg)
}

/** Data URL del SVG tal cual. Camino de respaldo. */
export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** La caja objetivo en píxeles FÍSICOS: la caja CSS por la densidad elegida. */
export function thumbTargetBox(): { width: number; height: number } {
  return { width: THUMB_BOX.width * THUMB_DPR, height: THUMB_BOX.height * THUMB_DPR }
}

/**
 * Ajusta el SVG a `box` con semántica `contain` y **le reescribe su propio
 * `width`/`height` al tamaño en píxeles del ráster**, conservando el `viewBox`.
 * Devuelve `null` si el SVG no declara medidas.
 *
 * ESTE ES EL PASO QUE DA LA NITIDEZ, y es fácil de omitir. Un `<img>` con un
 * SVG dentro tiene un **tamaño intrínseco**: el de sus atributos `width`/
 * `height`. El navegador rasteriza el vector UNA vez, a ese tamaño intrínseco, y
 * `drawImage(img, 0, 0, cw, ch)` **no re-rasteriza**: escala el bitmap que ya
 * generó.
 *
 * Como el SVG que sale de bpmn-js viene medido en coordenadas de diagrama (una
 * tarea son 100×80 unidades), dibujarlo en un lienzo de 900×420 sin tocar sus
 * atributos rasterizaba a ~250×150 y luego ampliaba ~3×. El fichero resultante
 * era un bitmap pequeño estirado: borroso en la tarjeta y borroso al abrirlo
 * suelto, porque el defecto está en el fichero, no en cómo se muestra.
 *
 * Igualando los atributos al tamaño del lienzo, el navegador rasteriza el vector
 * directamente a 900×420 y `drawImage` queda 1:1. El `viewBox` no se toca: es lo
 * que mantiene el encuadre y lo que usa `anchorBackgroundRect`.
 */
export function sizeSvgForRaster(
  svg: string,
  box: { width: number; height: number }
): { svg: string; width: number; height: number } | null {
  const { w, h } = parseSvgSize(svg)
  if (!w || !h) return null

  // `contain`: la escala la manda el eje que primero toca el borde de la caja.
  const scale = Math.min(box.width / w, box.height / h)
  const width = Math.max(1, Math.round(w * scale))
  const height = Math.max(1, Math.round(h * scale))

  return { svg: setSvgPixelSize(svg, width, height), width, height }
}

/**
 * Rasteriza un SVG a WebP mediante un canvas fuera de pantalla, ajustándolo
 * dentro de `box` (píxeles físicos) con la misma semántica que
 * `object-fit: contain`. Devuelve `null` si el entorno no puede rasterizar o no
 * soporta WebP — el llamador decide qué hacer.
 *
 * AMPLÍA CUANDO HACE FALTA, y es deliberado. Aquí el origen es **vectorial**: no
 * existe una "resolución nativa" que preservar, así que la regla de las fotos
 * —nunca ampliar— no aplica. Las medidas del `viewBox` están en coordenadas de
 * diagrama de bpmn-js (una tarea son 100×80 unidades), de modo que limitarse a
 * ellas hacía que el tamaño del ráster dependiera de **cuántos elementos tiene
 * el diagrama** en vez de de cómo se va a ver.
 *
 * El efecto era el contrario del esperado: los diagramas **simples** salían
 * borrosos. Un diagrama recortado al pool superior deja un `viewBox` de unas
 * 250×150 unidades; rasterizado a 250×150 px y pintado en una caja de 300×140
 * CSS, el navegador lo ampliaba ~1.9× en una pantalla de 2×. Los diagramas
 * grandes, en cambio, desperdiciaban píxeles.
 *
 * Escalando a la caja de presentación el ráster cae a 1:1 en píxeles físicos en
 * los dos casos, y el peso se vuelve casi constante.
 *
 * El tamaño del lienzo por sí solo NO basta: hay que reescribir también el
 * `width`/`height` del SVG, o el navegador rasteriza a las unidades de diagrama
 * y `drawImage` amplía ese bitmap. Lo hace `sizeSvgForRaster`, y es de donde
 * viene la nitidez de verdad.
 *
 * No hay dependencia del DPR de quien guarda: se rasteriza desde vectorial a un
 * tamaño absoluto que elegimos nosotros, no desde la pantalla. Dos usuarios con
 * pantallas distintas generan el mismo fichero.
 */
export function svgToWebp(
  svg: string,
  box: { width: number; height: number },
  quality: number,
  /** Solo para experimentar (ver `src/lab/thumbForge.ts`). En la app: el valor por defecto. */
  supersample: number = THUMB_SUPERSAMPLE
): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)

  const ajustado = sizeSvgForRaster(svg, box)
  if (!ajustado) return Promise.resolve(null)
  const { width: cw, height: ch } = ajustado

  // El SVG se pide al DOBLE (o el factor que sea) del lienzo, y se reduce al
  // dibujarlo. Se derivan de `cw`/`ch` y no de otro `sizeSvgForRaster` sobre una
  // caja mayor, para que el múltiplo sea exacto y no se descuadre por redondeo.
  const ss = Math.max(1, supersample)
  const svgPx = setSvgPixelSize(svg, cw * ss, ch * ss)

  return new Promise((resolve) => {
    let canvas: HTMLCanvasElement
    let ctx: CanvasRenderingContext2D | null
    try {
      canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      ctx = canvas.getContext('2d')
    } catch {
      resolve(null)
      return
    }
    if (!ctx) { resolve(null); return }

    // Reducir desde el ráster supermuestreado con el mejor filtro disponible.
    // Sin esto el navegador usa un remuestreo barato y se pierde justo lo que el
    // supermuestreo venía a ganar. Puede no existir en entornos de prueba.
    try {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
    } catch {
      /* el entorno no lo soporta: se dibuja con el filtro por defecto */
    }

    // Fondo opaco: WebP admite transparencia, pero la tarjeta espera un lienzo
    // blanco y así el resultado no depende del fondo donde se pinte.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cw, ch)

    // El SVG con sus atributos ya en píxeles: así el navegador rasteriza el
    // vector al tamaño final en vez de ampliar un bitmap pequeño.
    const blob = new Blob([svgPx], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()

    const done = (value: string | null) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }

    img.onload = () => {
      try {
        ctx!.drawImage(img, 0, 0, cw, ch)
        const dataUrl = canvas.toDataURL('image/webp', quality)
        // Un navegador sin WebP devuelve PNG en silencio. Se acepta igual: sigue
        // siendo raster y mucho más ligero que el SVG.
        done(dataUrl.startsWith('data:image/') ? dataUrl : null)
      } catch {
        done(null)
      }
    }
    img.onerror = () => done(null)
    img.src = url
  })
}

function parseSvgSize(svg: string): { w: number; h: number } {
  // Preferir el viewBox: tras `applyCrop` es la medida real del recorte.
  const vb = svg.match(/\bviewBox="[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/)
  if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) }
  const wm = svg.match(/\bwidth="([\d.]+)"/)
  const hm = svg.match(/\bheight="([\d.]+)"/)
  return { w: wm ? parseFloat(wm[1]) : 0, h: hm ? parseFloat(hm[1]) : 0 }
}

function ensureViewBox(svg: string): string {
  if (svg.includes('viewBox')) return svg
  const wm = svg.match(/\bwidth="([\d.]+)"/)
  const hm = svg.match(/\bheight="([\d.]+)"/)
  if (!wm || !hm) return svg
  return svg.replace('<svg', `<svg viewBox="0 0 ${wm[1]} ${hm[1]}"`)
}

// Reemplaza viewBox + width/height del <svg> raíz por el rect de recorte.
function applyCrop(svg: string, crop: CropRect): string {
  return svg
    .replace(/(<svg[^>]*?)\bviewBox="[^"]*"/, `$1viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}"`)
    .replace(/(<svg[^>]*?)\bwidth="[\d.]+"/, `$1width="${crop.width}"`)
    .replace(/(<svg[^>]*?)\bheight="[\d.]+"/, `$1height="${crop.height}"`)
}

// Convierte el rect de fondo `width="100%" height="100%"` (inyectado por
// injectThemeIntoSvg) en un rect con las coordenadas exactas del viewBox.
function anchorBackgroundRect(svg: string): string {
  const vb = svg.match(/\bviewBox="([-\d.]+)[ ,]+([-\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/)
  if (!vb) return svg
  const [, x, y, w, h] = vb
  return svg.replace(
    /<rect width="100%" height="100%" fill="/,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="`
  )
}
