import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { jsPDF } from 'jspdf'
import { useUIStore } from '@/store/uiStore'
import { exportToBpm } from '@/utils/bpmExport'
import { inlineImages } from '@/utils/imageStorage'

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

// ── Remapeo de colores sin tocar el DOM ─────────────────────────────
// El renderer (ThemeColors.ts / ThemeAwareRenderer.ts) hornea en el SVG los
// valores literales de estas variables CSS. Para exportar en el tema opuesto
// basta con sustituir valor-dark ↔ valor-light en el string SVG, leyendo los
// valores autorales del CSSOM (:root = light, [data-theme="dark"] = dark).
// Así el canvas vivo nunca se re-renderiza y no hay flash de tema.
const RENDERER_VARS = [
  '--task-fill', '--task-stroke', '--task-text',
  '--start-fill', '--start-stroke',
  '--end-fill', '--end-stroke',
  '--int-fill', '--int-stroke',
  '--gateway-fill', '--gateway-stroke',
  '--pool-fill', '--pool-stroke', '--lane-fill',
  '--text', '--text-2', '--bg', '--border-strong',
] as const

const LIGHT_SELECTOR = ':root'
const DARK_SELECTORS = ['[data-theme="dark"]', ':root[data-theme="dark"]']

function collectVarsFromRules(rules: CSSRuleList, selectors: string[], out: Record<string, string>): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule && selectors.includes(rule.selectorText)) {
      for (const v of RENDERER_VARS) {
        const val = rule.style.getPropertyValue(v).trim()
        if (val) out[v] = val
      }
    } else if ('cssRules' in rule) {
      // @media / @layer / @supports — descender
      collectVarsFromRules((rule as CSSGroupingRule).cssRules, selectors, out)
    }
  }
}

function readAuthoredVars(themeName: 'light' | 'dark'): Record<string, string> {
  const selectors = themeName === 'light' ? [LIGHT_SELECTOR] : DARK_SELECTORS
  const out: Record<string, string> = {}
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectVarsFromRules(sheet.cssRules, selectors, out)
    } catch {
      // hoja cross-origin: ignorar
    }
  }
  return out
}

// "#1e3a5f" → "rgb(30, 58, 95)" (serialización exacta del browser); null si no es hex.
function hexToRgbString(hex: string): string | null {
  const m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

// Mapa valorOrigen → valorDestino. Cada valor origen se registra en sus DOS
// serializaciones: hex (atributos fill="#...") y rgb() (el browser re-serializa
// las propiedades de style="fill: ..." como "rgb(r, g, b)" al exportar el SVG).
// null si el CSSOM no expone la paleta completa (p.ej. hoja cross-origin) —
// el caller cae al camino withTheme.
function buildThemeValueMap(from: 'light' | 'dark', to: 'light' | 'dark'): Map<string, string> | null {
  const fromVars = readAuthoredVars(from)
  const toVars = readAuthoredVars(to)
  const map = new Map<string, string>()
  for (const v of RENDERER_VARS) {
    const f = fromVars[v]
    const t = toVars[v]
    if (!f || !t) return null
    map.set(f.toLowerCase(), t)
    const rgb = hexToRgbString(f)
    if (rgb) map.set(rgb, t)
  }
  return map
}

// Markup transitorio de interacción que diagram-js dibuja en la capa activa
// y saveSVG() puede capturar (p.ej. autosave en mitad de un arrastre de lasso).
// Dentro de un <img> no hay CSS de la app, así que estos elementos renderizan
// con defaults SVG (fill negro) — hay que quitarlos del export.
const TRANSIENT_SELECTORS = [
  '.djs-lasso-overlay',
  '.djs-dragger',
  '.djs-drag-group',
  '.djs-resizer',
  '.djs-bendpoint',
  '.djs-segment-dragger',
].join(', ')

export function sanitizeExportedSvg(svg: string): string {
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    if (doc.querySelector('parsererror')) return svg
    doc.querySelectorAll(TRANSIENT_SELECTORS).forEach(el => el.remove())
    return new XMLSerializer().serializeToString(doc)
  } catch {
    return svg
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Sustitución en UNA sola pasada: un reemplazo secuencial se auto-contamina
// (p.ej. --text-2 dark #98a2b3 → light #475467, que es a la vez el valor
// dark de --pool-stroke y sería re-sustituido después).
function replaceSvgColors(svg: string, valueMap: Map<string, string>): string {
  const alternation = Array.from(valueMap.keys()).map(escapeRegExp).join('|')
  const pattern = new RegExp(`(${alternation})(?![0-9a-fA-F])`, 'gi')
  return svg.replace(pattern, m => valueMap.get(m.toLowerCase()) ?? m)
}

// Temporarily switches data-theme on <html>, waits for bpmn-js MutationObserver
// to re-render shape colors, then restores after fn completes.
// The 2-rAF wait gives the MutationObserver time to fire and repaint before
// saveSVG() serializes the updated elements.
// FALLBACK: causa un flash de tema visible en toda la app; solo se usa si
// buildThemeValueMap() no pudo leer la paleta del CSSOM.
export async function withTheme<T>(theme: ExportTheme, fn: () => Promise<T>): Promise<T> {
  const root    = document.documentElement
  const current = getCurrentDocTheme()
  const target  = theme === 'current' ? current : theme
  if (current === target) return fn()

  root.setAttribute('data-theme', target)
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  try {
    return await fn()
  } finally {
    root.setAttribute('data-theme', current)
    requestAnimationFrame(() => requestAnimationFrame(() => {}))
  }
}

export function injectThemeIntoSvg(svg: string, themeName: 'light' | 'dark'): string {
  const bg = THEME_BG[themeName] ?? '#ffffff'
  const text = THEME_TEXT[themeName] ?? '#0f172a'

  return svg.replace(/<svg([^>]*)>/, (_, attrs) =>
    `<svg${attrs}>
      <style>
        text, tspan { fill: ${text} !important; color: ${text} !important; stroke: none !important; }
      </style>
      <rect width="100%" height="100%" fill="${bg}"/>`)
}

// Returns a fully themed SVG: shape colors remapped to the target theme
// + text color + background rect injected. Used for export, preview and
// thumbnails. Remaps colors on the exported string — the live canvas is
// never re-rendered, so no theme flash.
export async function getThemedSvg(theme: ExportTheme, getSvg: () => Promise<string>): Promise<string> {
  const target  = resolveThemeName(theme)
  const current = getCurrentDocTheme() as 'light' | 'dark'

  if (current === target) {
    return injectThemeIntoSvg(sanitizeExportedSvg(await getSvg()), target)
  }

  const valueMap = buildThemeValueMap(current, target)
  if (valueMap) {
    return injectThemeIntoSvg(replaceSvgColors(sanitizeExportedSvg(await getSvg()), valueMap), target)
  }

  // Paleta ilegible desde CSSOM: camino antiguo (re-render con flash)
  return injectThemeIntoSvg(sanitizeExportedSvg(await withTheme(theme, getSvg)), target)
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
    const safeName  = diagramName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
    const theme     = opts.theme ?? 'current'
    const themeName = resolveThemeName(theme)
    const bg        = resolveBg(theme)

    setExporting(true)
    try {
      if (format === 'bpm') {
        // inlineImages: archivo autocontenido — las referencias de Storage se
        // vuelven a incrustar como base64 (funcionan fuera de la app).
        const xml  = await inlineImages(await getXml())
        const blob = await exportToBpm({ diagramName, bpmnXml: xml })
        downloadBlob(blob, `${safeName}.bpm`)

      } else if (format === 'bpmn') {
        const xml = await inlineImages(await getXml())
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
