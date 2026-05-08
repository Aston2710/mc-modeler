// src/utils/thumbnailUtils.ts
import { withTheme, injectThemeIntoSvg } from '@/hooks/useExport'

/**
 * Genera un data URL SVG apto para usar como thumbnail en DiagramCard.
 * - Siempre renderiza en tema light para preview consistente
 *   independiente del tema activo del usuario.
 * - Añade viewBox si bpmn-js no lo incluyó (necesario para object-fit: contain).
 * - withTheme cambia data-theme temporalmente, exporta, y lo restaura.
 */
export async function buildThumbnail(getSvg: () => Promise<string>): Promise<string> {
  // 1. Exportar SVG con colores de tema light (aunque el usuario esté en dark)
  const rawSvg = await withTheme('light', getSvg)

  // 2. Inyectar background blanco + colores de texto correctos
  const themedSvg = injectThemeIntoSvg(rawSvg, 'light')

  // 3. Añadir viewBox si no existe — necesario para que object-fit: contain funcione
  const svgWithViewBox = ensureViewBox(themedSvg)

  // 4. Convertir a data URL (inline, sin fetch adicional)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgWithViewBox)
}

function ensureViewBox(svg: string): string {
  if (svg.includes('viewBox')) return svg
  const wm = svg.match(/\bwidth="([\d.]+)"/)
  const hm = svg.match(/\bheight="([\d.]+)"/)
  if (!wm || !hm) return svg
  return svg.replace('<svg', `<svg viewBox="0 0 ${wm[1]} ${hm[1]}"`)
}