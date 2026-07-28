import { useTranslation } from 'react-i18next'
import {
  Undo2, Redo2,
  Sun, Moon, Save, Share2, LogOut, Eye,
} from 'lucide-react'
import { Brand } from '@/components/layout/Brand'
import { MenuBar } from '@/components/layout/MenuBar'
import { useDiagramStore } from '@/store/diagramStore'
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
  onOpenImages: () => void
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
  onSave, onGoHome, onOpenImages,
  canUndo, canRedo,
  cloudMode = false, canEdit = true, onShare, onSignOut,
}: ToolbarProps) {
  const { t } = useTranslation()
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const diagrams = useDiagramStore((s) => s.diagrams)
  const language = usePreferencesStore((s) => s.language)
  const setLanguage = usePreferencesStore((s) => s.setLanguage)
  const theme = usePreferencesStore((s) => s.theme)
  const setTheme = usePreferencesStore((s) => s.setTheme)

  const activeDiagram = diagrams.find((d) => d.id === activeTabId)

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <div className="toolbar">
      {/* ── Zona izquierda: identidad + menús ── */}
      {/* El nombre del diagrama vive en la pestaña (renombrable con doble clic);
          aquí ya no se repite. Los menús ocupan ese lugar. */}
      <Brand onClick={onGoHome} />

      <MenuBar
        onNew={onNew}
        onGoHome={onGoHome}
        onImport={onImport}
        onExport={onExport}
        onOpenImages={onOpenImages}
        onSave={onSave}
        onUndo={onUndo}
        onRedo={onRedo}
        onValidate={onValidate}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitToScreen={onFitToScreen}
        canUndo={canUndo}
        canRedo={canRedo}
        canEdit={canEdit}
      />

      <div className="tb-spacer" />

      {/* ── Zona derecha: sesión + colaboración ── */}
      {/* Deshacer/Rehacer también viven en Editar ▾; se mantienen aquí como acceso rápido. */}
      <div className="tb-group">
        <button className="icon-btn" onClick={onUndo} disabled={!canUndo || !canEdit} title={t('toolbar.undo')}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" onClick={onRedo} disabled={!canRedo || !canEdit} title={t('toolbar.redo')}>
          <Redo2 size={16} />
        </button>
      </div>

      <div className="divider-v" />

      <div className="lang-toggle">
        <button className={language === 'es' ? 'active' : ''} onClick={() => setLanguage('es')}>ES</button>
        <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
      </div>

      <button className="icon-btn" onClick={toggleTheme} title={t('toolbar.toggleTheme')}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {cloudMode && <NotificationBell />}
      {cloudMode && <PresenceAvatars />}

      {cloudMode && activeDiagram && (
        <button className="icon-btn" onClick={onShare} title={t('share.title')}>
          <Share2 size={16} />
          <span className="label">{t('share.title')}</span>
        </button>
      )}

      {cloudMode && activeDiagram && !canEdit && (
        <span className="readonly-badge" title={t('readonly.tooltip', 'Solo puedes ver y comentar este diagrama')}>
          <Eye size={13} />
          {t('readonly.badge', 'Solo lectura')}
        </span>
      )}

      {canEdit && (
        <button className="btn-primary" onClick={onSave} disabled={!activeDiagram}>
          <Save size={14} />
          {t('toolbar.save')}
        </button>
      )}

      {cloudMode && onSignOut && (
        <button className="icon-btn" onClick={onSignOut} title={t('auth.signOut')}>
          <LogOut size={16} />
        </button>
      )}
    </div>
  )
}
