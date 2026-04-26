import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface NewDiagramModalProps {
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function NewDiagramModal({ onConfirm, onCancel }: NewDiagramModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(t('diagrams.untitled'))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) onConfirm(name.trim())
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('modals.newDiagram.title')}</div>
          </div>
          <button className="icon-btn" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field">
              <label className="field-label">{t('properties.fields.name')}</label>
              <input
                ref={inputRef}
                className="f-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('modals.newDiagram.namePlaceholder')}
                autoFocus
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              {t('modals.newDiagram.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={!name.trim()}>
              {t('modals.newDiagram.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
