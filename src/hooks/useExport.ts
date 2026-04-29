import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { jsPDF } from 'jspdf'
import { useUIStore } from '@/store/uiStore'
import { exportToBpm } from '@/utils/bpmExport'

export type ExportFormat = 'bpmn' | 'png' | 'svg' | 'pdf' | 'bpm'
export type PngScale = 1 | 2 | 3
export type PdfOrientation = 'landscape' | 'portrait'
export type ExportTheme = 'current' | 'light' | 'dark'

const THEME_BG: Record<string, string> = {
  light: '#ffffff',
  dark:  '#0b0d12',
}
const THEME_TEXT: Record<string, string> = {
  light: '#0f172a',
  dark:  '#e6e9ef',
}

function getCurrentDocTheme(): string {
  return document.documentElement.getAttribute('data-theme') ?? 'light'
}

export function resolveThemeName(theme: ExportTheme): 'light' | 'dark' {
  return theme === 'current' ? (getCurrentDocTheme() as 'light' | 'dark') : theme
}

function resolveBg(theme: ExportTheme): string {
  return THEME_BG[resolveThemeName(theme)] ?? '#ffffff'
}

// Temporarily switches data-theme on <html>, waits for bpmn-js MutationObserver
// to re-render shape colors, then restores after fn completes.
// The 2-rAF wait gives the MutationObserver time to fire and repaint before
// saveSVG() serializes the updated elements.
export async function withTheme<T>(theme: ExportTheme, fn: () => Promise<T>): Promise<T> {
  const root    = document.documentElement
  const current = getCurrentDocTheme()
  const target  = theme === 'current' ? current : theme
  if (current === target) return fn()

  root.setAttribute('data-theme', target)
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  try {
    return await fn()
  } finally {
    root.setAttribute('data-theme', current)
    requestAnimationFrame(() => requestAnimationFrame(() => {}))
  }
}

// Post-processes the SVG string from bpmn-js saveSVG() to fix two things:
// 1. External labels (pool/lane names, event labels, gateway labels) use SVG
//    `currentColor` which inherits from CSS — fine on-screen, becomes black in
//    standalone SVG files. Setting `color` on the root SVG element fixes this.
// 2. No background is embedded — inject a <rect> so the file looks correct
//    when opened directly in a browser or rendered to canvas.
export function injectThemeIntoSvg(svg: string, themeName: 'light' | 'dark'): string {
  const text = THEME_TEXT[themeName] ?? '#0f172a'
  const bg   = THEME_BG[themeName]   ?? '#ffffff'

  return svg.replace(/<svg([^>]*)>/, (_, attrs: string) => {
    const newAttrs = attrs.includes('style=')
      ? attrs.replace(/style="([^"]*)"/, `style="$1;color:${text}"`)
      : `${attrs} style="color:${text}"`
    return `<svg${newAttrs}><rect width="100%" height="100%" fill="${bg}"/>`
  })
}

// Returns a fully themed SVG: bpmn-js shapes re-rendered in target theme colors
// + text color + background rect injected. Used for both export and preview.
export async function getThemedSvg(theme: ExportTheme, getSvg: () => Promise<string>): Promise<string> {
  const rawSvg    = await withTheme(theme, getSvg)
  const themeName = resolveThemeName(theme)
  return injectThemeIntoSvg(rawSvg, themeName)
}

function parseSvgSize(svg: string): { w: number; h: number } {
  const wm = svg.match(/\bwidth="([\d.]+)"/)
  const hm = svg.match(/\bheight="([\d.]+)"/)
  return {
    w: wm ? parseFloat(wm[1]) : 800,
    h: hm ? parseFloat(hm[1]) : 600,
  }
}

// Converts a themed SVG string to a PNG data URL via offscreen canvas.
// The SVG already contains a background <rect>, canvas fill is belt-and-suspenders.
export function svgToDataUrl(svg: string, scale: number, bg: string, padding = 20): Promise<string> {
  const { w, h } = parseSvgSize(svg)
  const cw = Math.round((w + padding * 2) * scale)
  const ch = Math.round((h + padding * 2) * scale)

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width  = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) { reject(new Error('No 2d context')); return }

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, cw, ch)

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const img  = new Image()

    img.onload = () => {
      ctx.drawImage(img, padding * scale, padding * scale, w * scale, h * scale)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG render failed'))
    }
    img.src = url
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadText(text: string, filename: string, mimeType: string) {
  downloadBlob(new Blob([text], { type: mimeType }), filename)
}

interface ExportOptions {
  format: ExportFormat
  scale?: PngScale
  orientation?: PdfOrientation
  theme?: ExportTheme
  diagramName: string
  getXml: () => Promise<string>
  getSvg: () => Promise<string>
}

export function useExport() {
  const { t } = useTranslation()
  const setExporting = useUIStore((s) => s.setExporting)
  const addToast     = useUIStore((s) => s.addToast)

  const run = useCallback(async (opts: ExportOptions) => {
    const { format, diagramName, getXml, getSvg } = opts
    const safeName  = diagramName.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
    const theme     = opts.theme ?? 'current'
    const themeName = resolveThemeName(theme)
    const bg        = resolveBg(theme)

    setExporting(true)
    try {
      if (format === 'bpm') {
        const xml  = await getXml()
        const blob = await exportToBpm({ diagramName, bpmnXml: xml })
        downloadBlob(blob, `${safeName}.bpm`)

      } else if (format === 'bpmn') {
        const xml = await getXml()
        downloadText(xml, `${safeName}.bpmn`, 'application/xml')

      } else if (format === 'svg') {
        // Apply theme to SVG — fixes dark-mode currentColor labels and adds background.
        const themedSvg = await getThemedSvg(theme, getSvg)
        downloadText(themedSvg, `${safeName}.svg`, 'image/svg+xml')

      } else if (format === 'png') {
        const scale     = opts.scale ?? 2
        const themedSvg = await getThemedSvg(theme, getSvg)
        const dataUrl   = await svgToDataUrl(themedSvg, scale, bg)
        const blob      = await (await fetch(dataUrl)).blob()
        downloadBlob(blob, `${safeName}.png`)

      } else if (format === 'pdf') {
        const orientation = opts.orientation ?? 'landscape'
        const themedSvg   = await getThemedSvg(theme, getSvg)
        const dataUrl     = await svgToDataUrl(themedSvg, 2, bg)

        const img = new Image()
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl })

        const pdf   = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
        const pageW = pdf.internal.pageSize.getWidth()
        const pageH = pdf.internal.pageSize.getHeight()
        const margin = 16
        const maxW   = pageW - margin * 2
        const maxH   = pageH - margin * 2 - 10
        const ratio  = Math.min(maxW / img.width, maxH / img.height)
        const w = img.width  * ratio
        const h = img.height * ratio
        const x = (pageW - w) / 2

        const headerTextColor = themeName === 'dark' ? 200 : 100
        pdf.setFontSize(10)
        pdf.setTextColor(headerTextColor)
        pdf.text(diagramName, margin, margin + 4)
        pdf.text(new Date().toLocaleDateString(), pageW - margin, margin + 4, { align: 'right' })
        pdf.addImage(dataUrl, 'PNG', x, margin + 12, w, h)
        pdf.save(`${safeName}.pdf`)
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: t('errors.exportFailed'),
        message: err instanceof Error ? err.message : t('errors.unknownError'),
      })
    } finally {
      setExporting(false)
    }
  }, [setExporting, addToast, t])

  return { run }
}
