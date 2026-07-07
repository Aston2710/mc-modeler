// src/utils/thumbnailUtils.ts
import { getThemedSvg } from '@/hooks/useExport'

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
 * Genera un data URL SVG apto para usar como thumbnail en DiagramCard.
 * - Siempre en tema light para preview consistente independiente del
 *   tema activo del usuario.
 * - getThemedSvg remapea los colores en el string exportado (dark → light)
 *   sin re-renderizar el canvas: no hay flash de tema al guardar.
 * - `getCrop` (opcional): recorta el thumbnail a ese rect — se usa para
 *   mostrar solo el pool superior cuando el diagrama tiene varios pools.
 * - Añade viewBox si bpmn-js no lo incluyó (necesario para object-fit: contain).
 */
export async function buildThumbnail(
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
  svg = anchorBackgroundRect(svg)

  // 5. Convertir a data URL (inline, sin fetch adicional)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
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
