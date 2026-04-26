import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, FileUp } from 'lucide-react'

interface ImportModalProps {
  onImport: (xml: string, filename: string) => void
  onCancel: () => void
}

export function ImportModal({ onImport, onCancel }: ImportModalProps) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = (file: File) => {
    setError(null)
    if (!file.name.endsWith('.bpmn')) {
      setError(t('modals.import.invalidExtension'))
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const xml = e.target?.result as string
      if (!xml.includes('bpmn') && !xml.includes('definitions')) {
        setError(t('modals.import.invalidFile'))
        return
      }
      const name = file.name.replace('.bpmn', '')
      onImport(xml, name)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('modals.import.title')}</div>
            <div className="modal-sub">{t('modals.import.subtitle')}</div>
          </div>
          <button className="icon-btn" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div
            className={`drop-zone ${dragOver ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <FileUp size={40} style={{ color: 'var(--text-3)', marginBottom: 12 }} />
            <div className="dz-title">{t('modals.import.dropzone')}</div>
            <div className="dz-sub" style={{ marginTop: 6 }}>
              {t('modals.import.or')}{' '}
              <span style={{ color: 'var(--primary)', fontWeight: 500, cursor: 'pointer' }}>
                {t('modals.import.browse')}
              </span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".bpmn"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
          {error && (
            <div style={{ marginTop: 12, color: 'var(--error)', fontSize: 12 }}>{error}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onCancel}>
            {t('modals.import.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
