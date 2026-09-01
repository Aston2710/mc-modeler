import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown, Check, Plus, Home, Upload, Download, Image as ImageIcon, Save,
  Undo2, Redo2, CheckSquare, ZoomIn, ZoomOut, Maximize2, MessageSquare, PanelRight, Stamp,
  LayoutGrid, List, Table2,
} from 'lucide-react'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useUIStore } from '@/store/uiStore'

type MenuKey = 'file' | 'edit' | 'view'

interface MenuBarProps {
  onNew: () => void
  onGoHome: () => void
  onImport: () => void
  onExport: () => void
  onOpenImages: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onValidate: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToScreen: () => void
  canUndo: boolean
  canRedo: boolean
  canEdit: boolean
}

/**
 * Barra de menú del editor (Archivo / Editar / Ver). Reagrupa las acciones que
 * antes vivían sueltas en el Toolbar. NO toca el modelado BPMN: solo dispara los
 * mismos handlers ya existentes. El desplegable se renderiza vía createPortal
 * (el `.toolbar` tiene overflow:hidden y recortaría un menú posicionado dentro).
 */
export function MenuBar(props: MenuBarProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<MenuKey | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const btnRefs: Record<MenuKey, React.RefObject<HTMLButtonElement | null>> = {
    file: useRef<HTMLButtonElement>(null),
    edit: useRef<HTMLButtonElement>(null),
    view: useRef<HTMLButtonElement>(null),
  }
  const menuRef = useRef<HTMLDivElement>(null)

  const showComments = usePreferencesStore((s) => s.showComments)
  const showDocumentHeader = usePreferencesStore((s) => s.showDocumentHeader)
  const setShowDocumentHeader = usePreferencesStore((s) => s.setShowDocumentHeader)
  const setShowComments = usePreferencesStore((s) => s.setShowComments)
  const paletteMode = usePreferencesStore((s) => s.paletteMode)
  const setPaletteMode = usePreferencesStore((s) => s.setPaletteMode)
  const propertiesPanelOpen = useUIStore((s) => s.propertiesPanelOpen)
  const setPropertiesPanelOpen = useUIStore((s) => s.setPropertiesPanelOpen)

  const close = useCallback(() => { setOpen(null); setPos(null) }, [])

  const openAt = useCallback((key: MenuKey) => {
    const rect = btnRefs[key].current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left })
    setOpen(key)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (key: MenuKey) => (open === key ? close() : openAt(key))
  // Barra de menú: si ya hay uno abierto, pasar el cursor a otro lo cambia.
  const hover = (key: MenuKey) => { if (open) openAt(key) }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (Object.values(btnRefs).some((r) => r.current?.contains(target))) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close])

  // Cerrar el menú y luego ejecutar la acción.
  const run = (fn: () => void) => () => { close(); fn() }

  const btn = (key: MenuKey, label: string) => (
    <button
      ref={btnRefs[key]}
      className="menu-btn"
      aria-haspopup="menu"
      aria-expanded={open === key}
      onClick={() => toggle(key)}
      onMouseEnter={() => hover(key)}
    >
      {label}
      <ChevronDown size={12} className="menu-chev" />
    </button>
  )

  return (
    <div className="menubar">
      {btn('file', t('menu.file'))}
      {btn('edit', t('menu.edit'))}
      {btn('view', t('menu.view'))}

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="menu-dropdown"
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
        >
          {open === 'file' && (
            <>
              <MenuItem icon={<Plus size={15} />} label={t('menu.newDiagram')} shortcut="Ctrl N" onClick={run(props.onNew)} />
              <MenuItem icon={<Home size={15} />} label={t('menu.goHome')} onClick={run(props.onGoHome)} />
              <MenuSep />
              <MenuItem icon={<Upload size={15} />} label={t('menu.import')} onClick={run(props.onImport)} />
              <MenuItem icon={<Download size={15} />} label={t('menu.export')} onClick={run(props.onExport)} />
              <MenuSep />
              <MenuItem icon={<ImageIcon size={15} />} label={t('menu.images')} onClick={run(props.onOpenImages)} />
              {props.canEdit && (
                <>
                  <MenuSep />
                  <MenuItem icon={<Save size={15} />} label={t('menu.save')} shortcut="Ctrl S" onClick={run(props.onSave)} />
                </>
              )}
            </>
          )}

          {open === 'edit' && (
            <>
              <MenuItem icon={<Undo2 size={15} />} label={t('menu.undo')} shortcut="Ctrl Z" onClick={run(props.onUndo)} disabled={!props.canUndo || !props.canEdit} />
              <MenuItem icon={<Redo2 size={15} />} label={t('menu.redo')} shortcut="Ctrl ⇧ Z" onClick={run(props.onRedo)} disabled={!props.canRedo || !props.canEdit} />
              <MenuSep />
              <MenuItem icon={<CheckSquare size={15} />} label={t('menu.validate')} shortcut="Ctrl ⇧ V" onClick={run(props.onValidate)} />
            </>
          )}

          {open === 'view' && (
            <>
              <MenuItem icon={<ZoomIn size={15} />} label={t('menu.zoomIn')} onClick={run(props.onZoomIn)} />
              <MenuItem icon={<ZoomOut size={15} />} label={t('menu.zoomOut')} onClick={run(props.onZoomOut)} />
              <MenuItem icon={<Maximize2 size={15} />} label={t('menu.fit')} onClick={run(props.onFitToScreen)} />
              <MenuSep />
              <MenuItem
                icon={<MessageSquare size={15} />}
                label={t('menu.comments')}
                checked={showComments}
                onClick={() => { setShowComments(!showComments); close() }}
              />
              <MenuItem
                icon={<PanelRight size={15} />}
                label={t('menu.propertiesPanel')}
                checked={propertiesPanelOpen}
                onClick={() => { setPropertiesPanelOpen(!propertiesPanelOpen); close() }}
              />
              {/* Solo cambia la vista. Que la cabecera exista es del proyecto, y
                  que salga impreso se decide al exportar. */}
              <MenuItem
                icon={<Stamp size={15} />}
                label={t('menu.documentHeader')}
                checked={showDocumentHeader}
                onClick={() => { setShowDocumentHeader(!showDocumentHeader); close() }}
              />
              <MenuSep />
              <div className="menu-head">{t('menu.palette')}</div>
              <MenuItem icon={<LayoutGrid size={15} />} label={t('menu.paletteMain')} checked={paletteMode === 'grid'} onClick={() => { setPaletteMode('grid'); close() }} />
              <MenuItem icon={<List size={15} />} label={t('menu.paletteGrouped')} checked={paletteMode === 'dropdown'} onClick={() => { setPaletteMode('dropdown'); close() }} />
              <MenuItem icon={<Table2 size={15} />} label={t('menu.paletteBizagi')} checked={paletteMode === 'bizagi'} onClick={() => { setPaletteMode('bizagi'); close() }} />
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  onClick: () => void
}

function MenuItem({ icon, label, shortcut, checked, disabled, onClick }: MenuItemProps) {
  return (
    <button
      className="menu-item"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked === undefined ? undefined : checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="mi-ico">{icon}</span>
      <span className="mi-label">{label}</span>
      {shortcut && <span className="mi-sc">{shortcut}</span>}
      {checked && <span className="mi-ck"><Check size={14} /></span>}
    </button>
  )
}

function MenuSep() {
  return <div className="menu-sep" role="separator" />
}
