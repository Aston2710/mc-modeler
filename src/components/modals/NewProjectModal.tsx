import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface NewProjectModalProps {
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function NewProjectModal({ onConfirm, onCancel }: NewProjectModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(t('projects.newTitle'))
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
            <div className="modal-title">{t('projects.newTitle')}</div>
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
                placeholder={t('projects.namePlaceholder')}
                autoFocus
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              {t('modals.newDiagram.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={!name.trim()}>
              {t('projects.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
