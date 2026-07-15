import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Upload, Download, CheckSquare,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
  Sun, Moon, Save, Home, GitBranch, Share2, LogOut,
  MessageSquare, Eye
} from 'lucide-react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { PresenceAvatars } from '@/components/collab/PresenceAvatars'
import { NotificationBell } from '@/components/layout/NotificationBell'

interface ToolbarProps {
  onNew: () => void
  onImport: () => void
  onExport: () => void
  onValidate: () => void
  onUndo: () => void
  onRedo: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToScreen: () => void
  onSave: () => void
  onGoHome: () => void
  canUndo: boolean
  canRedo: boolean
  cloudMode?: boolean
  canEdit?: boolean
  onShare?: () => void
  onSignOut?: () => void
}

export function Toolbar({
  onNew, onImport, onExport, onValidate,
  onUndo, onRedo, onZoomIn, onZoomOut, onFitToScreen,
  onSave, onGoHome,
  canUndo, canRedo,
  cloudMode = false, canEdit = true, onShare, onSignOut,
}: ToolbarProps) {
  const { t } = useTranslation()
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const diagrams = useDiagramStore((s) => s.diagrams)
  const renameDiagram = useDiagramStore((s) => s.renameDiagram)
  const zoom = useUIStore((s) => s.zoom)
  const unsavedChanges = useUIStore((s) => s.unsavedChanges)
  const validationResults = useUIStore((s) => s.validationResults)
  const language = usePreferencesStore((s) => s.language)
  const setLanguage = usePreferencesStore((s) => s.setLanguage)
  const theme = usePreferencesStore((s) => s.theme)
  const setTheme = usePreferencesStore((s) => s.setTheme)
  const showComments = usePreferencesStore((s) => s.showComments)
  const setShowComments = usePreferencesStore((s) => s.setShowComments)

  const activeDiagram = diagrams.find((d) => d.id === activeTabId)
  const errorCount = validationResults.filter((r) => r.severity === 'error').length

  const [localName, setLocalName] = useState(activeDiagram?.name ?? '')
  useEffect(() => {
    setLocalName(activeDiagram?.name ?? '')
  }, [activeDiagram?.name])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const handleNameBlur = () => {
    if (activeTabId && localName.trim()) renameDiagram(activeTabId, localName.trim())
    else setLocalName(activeDiagram?.name ?? '')
  }

  return (
    <div className="toolbar">
      {/* Brand */}
      <button className="brand" onClick={onGoHome}>
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="6" cy="6" r="3" stroke="white" strokeWidth="2" />
            <path d="M9 6h6M15 6l-3 3M15 6l-3-3" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <rect x="14" y="9" width="6" height="6" rx="1" stroke="white" strokeWidth="2" />
          </svg>
        </div>
        <span className="brand-name">Flujo<span className="dot">.</span></span>
      </button>

      {/* Diagram name + breadcrumb */}
      {activeDiagram && (
        <div className="diagram-name-wrap">
          <GitBranch size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            className="diagram-name-input"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            disabled={!canEdit}
          />
          {unsavedChanges && (
            <span style={{ color: 'var(--warning)', fontSize: 18, lineHeight: 1 }}>•</span>
          )}
        </div>
      )}

      <div className="tb-spacer" />

      {/* Home */}
      <div className="tb-group">
        <button className="icon-btn" onClick={onGoHome} title={t('toolbar.myDiagrams')}>
          <Home size={16} />
        </button>
      </div>

      {/* Actions */}
      <div className="tb-group">
        <button className="icon-btn" onClick={onNew} title={t('toolbar.newDiagram')}>
          <Plus size={16} />
          <span className="label">{t('toolbar.newDiagram')}</span>
        </button>
        <button className="icon-btn" onClick={onImport} title={t('toolbar.import')}>
          <Upload size={16} />
        </button>
        <button className="icon-btn" onClick={onExport} title={t('toolbar.export')} disabled={!activeDiagram}>
          <Download size={16} />
        </button>
        <button
          className={`icon-btn ${errorCount > 0 ? 'active' : ''}`}
          onClick={onValidate}
          title={t('toolbar.validate')}
          disabled={!activeDiagram}
        >
          <CheckSquare size={16} />
        </button>
        <button
          className={`icon-btn ${showComments ? 'active' : ''}`}
          onClick={() => setShowComments(!showComments)}
          title={showComments ? t('toolbar.hideComments') : t('toolbar.showComments')}
          disabled={!activeDiagram}
        >
          <MessageSquare size={16} />
        </button>
      </div>

      {/* Undo/Redo */}
      <div className="tb-group">
        <button className="icon-btn" onClick={onUndo} disabled={!canUndo || !canEdit} title={t('toolbar.undo')}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" onClick={onRedo} disabled={!canRedo || !canEdit} title={t('toolbar.redo')}>
          <Redo2 size={16} />
        </button>
      </div>

      {/* Zoom */}
      <div className="zoom-pill">
        <button onClick={onZoomOut} title={t('toolbar.zoomOut')}>
          <ZoomOut size={13} />
        </button>
        <span className="zoom-val">{Math.round(zoom * 100)}%</span>
        <button onClick={onZoomIn} title={t('toolbar.zoomIn')}>
          <ZoomIn size={13} />
        </button>
        <button onClick={onFitToScreen} title={t('toolbar.fitToScreen')}>
          <Maximize2 size={13} />
        </button>
      </div>

      <div className="divider-v" />

      {/* Language */}
      <div className="lang-toggle">
        <button
          className={language === 'es' ? 'active' : ''}
          onClick={() => setLanguage('es')}
        >
          ES
        </button>
        <button
          className={language === 'en' ? 'active' : ''}
          onClick={() => setLanguage('en')}
        >
          EN
        </button>
      </div>

      {/* Theme */}
      <button className="icon-btn" onClick={toggleTheme} title={t('toolbar.toggleTheme')}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Notificaciones */}
      {cloudMode && <NotificationBell />}

      {/* Presencia en tiempo real */}
      {cloudMode && <PresenceAvatars />}

      {/* Share (cloud) */}
      {cloudMode && activeDiagram && (
        <button className="icon-btn" onClick={onShare} title={t('share.title')}>
          <Share2 size={16} />
          <span className="label">{t('share.title')}</span>
        </button>
      )}

      {/* Solo lectura: viewer no puede editar */}
      {cloudMode && activeDiagram && !canEdit && (
        <span className="readonly-badge" title={t('readonly.tooltip', 'Solo puedes ver y comentar este diagrama')}>
          <Eye size={13} />
          {t('readonly.badge', 'Solo lectura')}
        </span>
      )}

      {/* Save */}
      {canEdit && (
        <button className="btn-primary" onClick={onSave} disabled={!activeDiagram}>
          <Save size={14} />
          {t('toolbar.save')}
        </button>
      )}

      {/* Sign out (cloud) */}
      {cloudMode && onSignOut && (
        <button className="icon-btn" onClick={onSignOut} title={t('auth.signOut')}>
          <LogOut size={16} />
        </button>
      )}
    </div>
  )
}
