import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { ExportFormat, PngScale, PdfOrientation, ExportTheme } from '@/hooks/useExport'
import { getThemedSvg, resolveThemeName } from '@/hooks/useExport'

const THEME_FORMATS: ExportFormat[] = ['png', 'pdf', 'svg']

const FORMATS: { id: ExportFormat; ext: string }[] = [
  { id: 'bpmn', ext: '.bpmn' },
  { id: 'bpm',  ext: '.bpm'  },
  { id: 'png',  ext: '.png'  },
  { id: 'svg',  ext: '.svg'  },
  { id: 'pdf',  ext: '.pdf'  },
]

const PREVIEW_BG: Record<string, string> = {
  light: '#ffffff',
  dark:  '#0b0d12',
}

interface ExportModalProps {
  diagramName: string
  getSvg: () => Promise<string>
  onExport: (format: ExportFormat, scale?: PngScale, orientation?: PdfOrientation, theme?: ExportTheme) => void
  onCancel: () => void
  isExporting: boolean
}

export function ExportModal({ diagramName, getSvg, onExport, onCancel, isExporting }: ExportModalProps) {
  const { t } = useTranslation()
  const [format, setFormat]           = useState<ExportFormat>('bpmn')
  const [scale, setScale]             = useState<PngScale>(2)
  const [orientation, setOrientation] = useState<PdfOrientation>('landscape')
  const [theme, setTheme]             = useState<ExportTheme>('current')
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const prevUrlRef = useRef<string | null>(null)

  const supportsTheme = THEME_FORMATS.includes(format)
  const effectiveTheme: ExportTheme = supportsTheme ? theme : 'current'

  // Regenerate preview whenever theme option changes.
  // withTheme temporarily re-renders bpmn-js shapes in the target theme —
  // the brief canvas switch is invisible behind the modal's backdrop-filter:blur.
  useEffect(() => {
    let cancelled = false
    setPreviewLoading(true)

    getThemedSvg(effectiveTheme, getSvg)
      .then(svg => {
        if (cancelled) return
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url  = URL.createObjectURL(blob)
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = url
        setPreviewUrl(url)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPreviewLoading(false) })

    return () => {
      cancelled = true
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = null
      }
    }
  }, [effectiveTheme, getSvg])

  const previewBg = PREVIEW_BG[resolveThemeName(effectiveTheme)] ?? '#ffffff'

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('modals.export.title')}</div>
            <div className="modal-sub">{diagramName}</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Format selection */}
          <div className="fmt-grid">
            {FORMATS.map(({ id, ext }) => (
              <div
                key={id}
                className={`fmt-card ${format === id ? 'selected' : ''}`}
                onClick={() => setFormat(id)}
              >
                <div className="fmt-icon">{ext.toUpperCase().replace('.', '')}</div>
                <div>
                  <div className="fmt-name">{t(`modals.export.formats.${id}.name`)}</div>
                  <div className="fmt-desc">{t(`modals.export.formats.${id}.desc`)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Options */}
          <div className="export-options-row">
            {format === 'png' && (
              <div className="field">
                <label className="field-label">{t('modals.export.options.scale')}</label>
                <select className="f-select" value={scale} onChange={(e) => setScale(Number(e.target.value) as PngScale)}>
                  <option value={1}>{t('modals.export.options.scale1x')}</option>
                  <option value={2}>{t('modals.export.options.scale2x')}</option>
                  <option value={3}>{t('modals.export.options.scale3x')}</option>
                </select>
              </div>
            )}

            {format === 'pdf' && (
              <div className="field">
                <label className="field-label">{t('modals.export.options.orientation')}</label>
                <select className="f-select" value={orientation} onChange={(e) => setOrientation(e.target.value as PdfOrientation)}>
                  <option value="landscape">{t('modals.export.options.landscape')}</option>
                  <option value="portrait">{t('modals.export.options.portrait')}</option>
                </select>
              </div>
            )}

            {supportsTheme && (
              <div className="field">
                <label className="field-label">{t('modals.export.options.theme')}</label>
                <select className="f-select" value={theme} onChange={(e) => setTheme(e.target.value as ExportTheme)}>
                  <option value="current">{t('modals.export.options.themeCurrent')}</option>
                  <option value="light">{t('modals.export.options.themeLight')}</option>
                  <option value="dark">{t('modals.export.options.themeDark')}</option>
                </select>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="export-preview">
            <div className="export-preview__label">{t('modals.export.preview')}</div>
            <div className="export-preview__box" style={{ background: previewBg }}>
              {previewLoading
                ? <span className="export-preview__loading">…</span>
                : previewUrl
                  ? <img src={previewUrl} alt="preview" className="export-preview__img" />
                  : <span className="export-preview__loading">—</span>
              }
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onCancel}>{t('modals.export.cancel')}</button>
          <button
            className="btn-primary"
            onClick={() => onExport(format, scale, orientation, effectiveTheme)}
            disabled={isExporting}
          >
            {isExporting ? '…' : t('modals.export.export')}
          </button>
        </div>
      </div>
    </div>
  )
}
