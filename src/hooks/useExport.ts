import { useCallback } from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { useUIStore } from '@/store/uiStore'

export type ExportFormat = 'bpmn' | 'png' | 'svg' | 'pdf'
export type PngScale = 1 | 2 | 3
export type PdfOrientation = 'landscape' | 'portrait'

interface ExportOptions {
  format: ExportFormat
  scale?: PngScale
  orientation?: PdfOrientation
  diagramName: string
  getXml: () => Promise<string>
  getSvg: () => Promise<string>
  canvasEl: HTMLElement | null
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadText(text: string, filename: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType })
  downloadBlob(blob, filename)
}

export function useExport() {
  const setExporting = useUIStore((s) => s.setExporting)
  const addToast = useUIStore((s) => s.addToast)

  const run = useCallback(async (opts: ExportOptions) => {
    const { format, diagramName, getXml, getSvg, canvasEl } = opts
    const safeName = diagramName.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()

    setExporting(true)
    try {
      if (format === 'bpmn') {
        const xml = await getXml()
        downloadText(xml, `${safeName}.bpmn`, 'application/xml')
      } else if (format === 'svg') {
        const svg = await getSvg()
        downloadText(svg, `${safeName}.svg`, 'image/svg+xml')
      } else if (format === 'png') {
        if (!canvasEl) throw new Error('Canvas not available')
        const scale = opts.scale ?? 2
        const dataUrl = await toPng(canvasEl, { pixelRatio: scale })
        const blob = await (await fetch(dataUrl)).blob()
        downloadBlob(blob, `${safeName}.png`)
      } else if (format === 'pdf') {
        if (!canvasEl) throw new Error('Canvas not available')
        const orientation = opts.orientation ?? 'landscape'
        const dataUrl = await toPng(canvasEl, { pixelRatio: 2 })
        const img = new Image()
        await new Promise<void>((res, rej) => {
          img.onload = () => res()
          img.onerror = rej
          img.src = dataUrl
        })
        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
        const pageW = pdf.internal.pageSize.getWidth()
        const pageH = pdf.internal.pageSize.getHeight()
        const margin = 16
        const maxW = pageW - margin * 2
        const maxH = pageH - margin * 2 - 10 // 10 for header
        const ratio = Math.min(maxW / img.width, maxH / img.height)
        const w = img.width * ratio
        const h = img.height * ratio
        const x = (pageW - w) / 2
        // Header
        pdf.setFontSize(10)
        pdf.setTextColor(100)
        pdf.text(diagramName, margin, margin + 4)
        pdf.text(new Date().toLocaleDateString(), pageW - margin, margin + 4, { align: 'right' })
        pdf.addImage(dataUrl, 'PNG', x, margin + 12, w, h)
        pdf.save(`${safeName}.pdf`)
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Export failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setExporting(false)
    }
  }, [setExporting, addToast])

  return { run }
}
