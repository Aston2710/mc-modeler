import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { ExportFormat, PngScale, PdfOrientation } from '@/hooks/useExport'

interface ExportModalProps {
  diagramName: string
  onExport: (format: ExportFormat, scale?: PngScale, orientation?: PdfOrientation) => void
  onCancel: () => void
  isExporting: boolean
}

const FORMATS: { id: ExportFormat; ext: string }[] = [
  { id: 'bpmn', ext: '.bpmn' },
  { id: 'png', ext: '.png' },
  { id: 'svg', ext: '.svg' },
  { id: 'pdf', ext: '.pdf' },
]

export function ExportModal({ diagramName, onExport, onCancel, isExporting }: ExportModalProps) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>('bpmn')
  const [scale, setScale] = useState<PngScale>(2)
  const [orientation, setOrientation] = useState<PdfOrientation>('landscape')

  const handleExport = () => {
    onExport(format, scale, orientation)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('modals.export.title')}</div>
            <div className="modal-sub">{diagramName}</div>
          </div>
          <button className="icon-btn" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
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
              <select
                className="f-select"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as PdfOrientation)}
              >
                <option value="landscape">{t('modals.export.options.landscape')}</option>
                <option value="portrait">{t('modals.export.options.portrait')}</option>
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onCancel}>
            {t('modals.export.cancel')}
          </button>
          <button className="btn-primary" onClick={handleExport} disabled={isExporting}>
            {isExporting ? '...' : t('modals.export.export')}
          </button>
        </div>
      </div>
    </div>
  )
}
