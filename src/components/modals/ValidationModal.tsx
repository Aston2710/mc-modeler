import { useTranslation } from 'react-i18next'
import { X, CheckCircle } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import type { ValidationResult } from '@/domain/types'

interface ValidationModalProps {
  onClose: () => void
  onJumpToElement: (elementId: string) => void
}

export function ValidationModal({ onClose, onJumpToElement }: ValidationModalProps) {
  const { t } = useTranslation()
  const results = useUIStore((s) => s.validationResults)
  const errors = results.filter((r) => r.severity === 'error')
  const warnings = results.filter((r) => r.severity === 'warning')

  const renderItem = (r: ValidationResult) => (
    <div
      key={r.id}
      className="val-item"
      onClick={() => r.elementId && onJumpToElement(r.elementId)}
    >
      <span className={`val-dot ${r.severity}`} />
      <div>
        <div className="val-code">{r.code}</div>
        <div className="val-msg">{r.message}</div>
        {r.elementName && (
          <div className="val-el">→ {r.elementName} ({r.elementId})</div>
        )}
      </div>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{t('modals.validation.title')}</div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {results.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 12, color: 'var(--ok)' }}>
              <CheckCircle size={36} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{t('modals.validation.noErrors')}</span>
            </div>
          ) : (
            <>
              {errors.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--error)', marginBottom: 8 }}>
                    {t('modals.validation.errors')} ({errors.length})
                  </div>
                  {errors.map(renderItem)}
                </>
              )}
              {warnings.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--warning)', marginBottom: 8, marginTop: errors.length ? 16 : 0 }}>
                    {t('modals.validation.warnings')} ({warnings.length})
                  </div>
                  {warnings.map(renderItem)}
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
