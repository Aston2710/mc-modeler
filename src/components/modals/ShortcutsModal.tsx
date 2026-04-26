import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface ShortcutsModalProps {
  onClose: () => void
}

const isMac = navigator.platform.toUpperCase().includes('MAC')
const Mod = isMac ? '⌘' : 'Ctrl'

const SHORTCUTS = [
  { group: 'canvas', key: 'undo', keys: [[Mod, 'Z']] },
  { group: 'canvas', key: 'redo', keys: [[Mod, 'Shift', 'Z']] },
  { group: 'edit', key: 'copy', keys: [[Mod, 'C']] },
  { group: 'edit', key: 'cut', keys: [[Mod, 'X']] },
  { group: 'edit', key: 'paste', keys: [[Mod, 'V']] },
  { group: 'edit', key: 'delete', keys: [['Del']] },
  { group: 'edit', key: 'selectAll', keys: [[Mod, 'A']] },
  { group: 'view', key: 'zoomIn', keys: [[Mod, '+']] },
  { group: 'view', key: 'zoomOut', keys: [[Mod, '-']] },
  { group: 'view', key: 'fitToScreen', keys: [[Mod, 'Shift', 'H']] },
  { group: 'view', key: 'zoomReset', keys: [[Mod, '0']] },
  { group: 'diagram', key: 'save', keys: [[Mod, 'S']] },
  { group: 'diagram', key: 'newDiagram', keys: [[Mod, 'N']] },
  { group: 'diagram', key: 'validate', keys: [['F5']] },
  { group: 'diagram', key: 'help', keys: [['?']] },
]

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const { t } = useTranslation()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 'min(720px, 92vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">{t('modals.shortcuts.title')}</div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="shortcuts-grid">
            {SHORTCUTS.map(({ key, keys }) => (
              <div key={key} className="kbd-row">
                <span className="kbd-lbl">{t(`modals.shortcuts.keys.${key}`)}</span>
                <div className="kbd">
                  {keys[0].map((k, i) => (
                    <kbd key={i}>{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
