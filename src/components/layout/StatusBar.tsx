import { useTranslation } from 'react-i18next'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { formatSaveTime } from '@/utils/dateFormatter'

interface StatusBarProps {
  onOpenValidation: () => void
  onOpenShortcuts: () => void
}

export function StatusBar({ onOpenValidation, onOpenShortcuts }: StatusBarProps) {
  const { t } = useTranslation()
  const lastSavedAt = useDiagramStore((s) => s.lastSavedAt)
  const activeDiagram = useDiagramStore((s) => s.activeDiagram())
  const zoom = useUIStore((s) => s.zoom)
  const unsavedChanges = useUIStore((s) => s.unsavedChanges)
  const validationResults = useUIStore((s) => s.validationResults)
  const tabs = useDiagramStore((s) => s.tabs)
  const language = usePreferencesStore((s) => s.language)

  const errorCount = validationResults.filter((r) => r.severity === 'error').length
  const warnCount = validationResults.filter((r) => r.severity === 'warning').length
  const hasIssues = errorCount > 0 || warnCount > 0

  const savedTime = lastSavedAt ? formatSaveTime(lastSavedAt, language) : ''
  const saveLabel = unsavedChanges
    ? t('statusbar.unsaved')
    : savedTime
      ? t('statusbar.savedAgo', { time: savedTime })
      : t('statusbar.saved')

  const saveClass = unsavedChanges ? 'warn' : ''

  return (
    <div className="statusbar">
      <div className={`sb-item ${saveClass}`}>
        <span className={`sb-dot ${saveClass}`} />
        <span>{saveLabel}</span>
      </div>

      <div className="sb-item">
        <span>{Math.round(zoom * 100)}%</span>
      </div>

      {activeDiagram && (
        <div className="sb-item">
          <span>
            {t('statusbar.elements_other', { count: activeDiagram.elementCount })}
          </span>
        </div>
      )}

      {tabs.length > 1 && (
        <div className="sb-item">
          <span>{t('statusbar.tabs', { count: tabs.length })}</span>
        </div>
      )}

      <div className="sb-spacer" />

      {hasIssues && (
        <div className={`sb-item ${errorCount > 0 ? 'err' : 'warn'}`} style={{ cursor: 'pointer' }} onClick={onOpenValidation}>
          <span className={`sb-dot ${errorCount > 0 ? 'err' : 'warn'}`} />
          <span>
            {errorCount > 0 && t('statusbar.errors', { count: errorCount })}
            {errorCount > 0 && warnCount > 0 && ' '}
            {warnCount > 0 && t('statusbar.warnings', { count: warnCount })}
          </span>
        </div>
      )}

      <div className="sb-item" style={{ cursor: 'pointer' }} onClick={onOpenShortcuts}>
        <span>{t('statusbar.shortcuts')} ?</span>
      </div>

      <div className="sb-item">
        <span className="sb-badge">{t('statusbar.bpmn20')}</span>
      </div>
    </div>
  )
}
