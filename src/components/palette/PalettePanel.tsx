import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, ChevronLeft, ChevronRight, Settings2, Check } from 'lucide-react'
import { BPMN_ELEMENTS, BIZAGI_GROUPS, CATEGORY_LABELS, type BpmnCategory } from '@/domain/bpmnElements'
import { BpmnElementIcon } from './BpmnElementIcon'
import { usePreferencesStore } from '@/store/preferencesStore'

interface PalettePanelProps {
  collapsed: boolean
  onToggle: () => void
  onStartCreate: (bpmnType: string, event: MouseEvent) => void
}

const CATEGORIES: BpmnCategory[] = ['events', 'activities', 'gateways', 'connections', 'containers']

const CATEGORY_REPRESENTATIVE: Record<BpmnCategory, string> = {
  events: 'startEvent',
  activities: 'task',
  gateways: 'exclusiveGateway',
  connections: 'sequenceFlow',
  containers: 'pool',
}

export function PalettePanel({ collapsed, onToggle, onStartCreate }: PalettePanelProps) {
  const { t } = useTranslation()
  const paletteMode = usePreferencesStore((s) => s.paletteMode)
  const setPaletteMode = usePreferencesStore((s) => s.setPaletteMode)
  const [search, setSearch] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPos, setSettingsPos] = useState<{ top: number; left: number } | null>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const settingsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !settingsBtnRef.current?.contains(target) &&
        !settingsMenuRef.current?.contains(target)
      ) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [settingsOpen])

  const handleSettingsClick = () => {
    if (settingsOpen) {
      setSettingsOpen(false)
      return
    }
    const rect = settingsBtnRef.current?.getBoundingClientRect()
    if (rect) setSettingsPos({ top: rect.bottom + 4, left: rect.left })
    setSettingsOpen(true)
  }

  const selectMode = (mode: 'grid' | 'dropdown') => {
    setPaletteMode(mode)
    setSettingsOpen(false)
  }

  const toggleCat = (id: string) =>
    setCollapsedCats((prev) => ({ ...prev, [id]: !prev[id] }))

  const filtered = search
    ? BPMN_ELEMENTS.filter((el) =>
        t(el.labelKey).toLowerCase().includes(search.toLowerCase())
      )
    : null

  if (collapsed) {
    return (
      <div className="collapsed-rail">
        <button className="icon-btn" onClick={onToggle} title={t('palette.search')}>
          <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="sidebar-l">
      <div className="sb-header">
        <span className="sb-title">{t('palette.title')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            ref={settingsBtnRef}
            className={`sb-collapse-btn${settingsOpen ? ' active' : ''}`}
            onClick={handleSettingsClick}
            title="Configuración de paleta"
          >
            <Settings2 size={14} />
          </button>
          {settingsOpen && settingsPos && createPortal(
            <div
              ref={settingsMenuRef}
              className="palette-settings-menu"
              style={{ position: 'fixed', top: settingsPos.top, left: settingsPos.left }}
            >
              <div
                className={`palette-settings-item${paletteMode === 'grid' ? ' palette-settings-item--active' : ''}`}
                onClick={() => selectMode('grid')}
              >
                <span>Principal</span>
                {paletteMode === 'grid' && <Check size={13} />}
              </div>
              <div
                className={`palette-settings-item${paletteMode === 'dropdown' ? ' palette-settings-item--active' : ''}`}
                onClick={() => selectMode('dropdown')}
              >
                <span>Agrupada</span>
                {paletteMode === 'dropdown' && <Check size={13} />}
              </div>
              <div
                className={`palette-settings-item${paletteMode === 'bizagi' ? ' palette-settings-item--active' : ''}`}
                onClick={() => selectMode('bizagi')}
              >
                <span>Bizagi</span>
                {paletteMode === 'bizagi' && <Check size={13} />}
              </div>
            </div>,
            document.body
          )}
        </div>
        <button className="sb-collapse-btn" onClick={onToggle} title="Colapsar">
          <ChevronLeft size={14} />
        </button>
      </div>

      <div className="palette-search">
        <Search />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('palette.search')}
        />
      </div>

      {paletteMode === 'bizagi' && !filtered ? (
        <BizagiPalette onStartCreate={onStartCreate} />
      ) : paletteMode === 'dropdown' && !filtered ? (
        <DropdownPalette onStartCreate={onStartCreate} />
      ) : (
        <div className="palette">
          {filtered ? (
            <div>
              {CATEGORIES.map((cat) => {
                const items = filtered.filter((el) => el.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat} className="cat">
                    <div className="cat-header">
                      {t(CATEGORY_LABELS[cat])}
                    </div>
                    <div className="cat-items">
                      {items.map((el) => (
                        <PaletteItem key={el.type} type={el.type} bpmnType={el.bpmnType} category={el.category} label={t(el.labelKey)} onStartCreate={onStartCreate} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            CATEGORIES.map((cat) => {
              const items = BPMN_ELEMENTS.filter((el) => el.category === cat)
              const isCollapsed = collapsedCats[cat]
              return (
                <div key={cat} className="cat">
                  <div
                    className={`cat-header ${isCollapsed ? 'collapsed' : ''}`}
                    onClick={() => toggleCat(cat)}
                  >
                    <ChevronDown size={10} />
                    {t(CATEGORY_LABELS[cat])}
                    <span className="cat-count">{items.length}</span>
                  </div>
                  <div className={`cat-items ${isCollapsed ? 'collapsed' : ''}`}>
                    {items.map((el) => (
                      <PaletteItem key={el.type} type={el.type} bpmnType={el.bpmnType} category={el.category} label={t(el.labelKey)} onStartCreate={onStartCreate} />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Dropdown mode ────────────────────────────────────────────────────────────

interface DropdownPaletteProps {
  onStartCreate: (bpmnType: string, event: MouseEvent) => void
}

function DropdownPalette({ onStartCreate }: DropdownPaletteProps) {
  const { t } = useTranslation()
  const [openCat, setOpenCat] = useState<BpmnCategory | null>(null)
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!openCat) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest('.dd-flyout') && !target.closest('.dd-cat-row')) {
        setOpenCat(null)
        setFlyoutPos(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openCat])

  const handleCatClick = (cat: BpmnCategory, e: React.MouseEvent<HTMLDivElement>) => {
    if (openCat === cat) {
      setOpenCat(null)
      setFlyoutPos(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setFlyoutPos({ top: rect.top, left: rect.right + 4 })
    setOpenCat(cat)
  }

  return (
    <div className="palette palette--dd">
      {CATEGORIES.map((cat) => {
        const rep = CATEGORY_REPRESENTATIVE[cat]
        const isOpen = openCat === cat
        return (
          <div
            key={cat}
            className={`dd-cat-row${isOpen ? ' dd-cat-row--open' : ''}`}
            onClick={(e) => handleCatClick(cat, e)}
          >
            <BpmnElementIcon type={rep} size={22} />
            <span className="dd-cat-label">{t(CATEGORY_LABELS[cat])}</span>
            <ChevronRight
              size={12}
              className={`dd-chevron${isOpen ? ' dd-chevron--open' : ''}`}
            />
          </div>
        )
      })}

      {openCat && flyoutPos && createPortal(
        <div
          className="dd-flyout"
          style={{ top: flyoutPos.top, left: flyoutPos.left }}
        >
          {BPMN_ELEMENTS.filter((el) => el.category === openCat).map((el) => {
            const isConn = el.category === 'connections'
            return (
              <div
                key={el.type}
                className={`dd-flyout-item${isConn ? ' dd-flyout-item--disabled' : ''}`}
                onMouseDown={isConn ? undefined : (e) => {
                  e.preventDefault()
                  setOpenCat(null)
                  setFlyoutPos(null)
                  onStartCreate(el.type, e.nativeEvent)
                }}
              >
                <BpmnElementIcon type={el.type} size={18} />
                <span>{t(el.labelKey)}</span>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Bizagi mode ─────────────────────────────────────────────────────────────

function BizagiPalette({ onStartCreate }: { onStartCreate: (bpmnType: string, event: MouseEvent) => void }) {
  const { t } = useTranslation()
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openGroup) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest('.bz-flyout') && !target.closest('.bz-chevron-btn')) {
        setOpenGroup(null)
        setFlyoutPos(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openGroup])

  const handleChevronClick = (groupType: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (openGroup === groupType) {
      setOpenGroup(null)
      setFlyoutPos(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setFlyoutPos({ top: rect.top, left: rect.right + 6 })
    setOpenGroup(groupType)
  }

  return (
    <div className="palette palette--bz">
      <div className="bz-grid">
        {BIZAGI_GROUPS.map((group) => {
          const el = BPMN_ELEMENTS.find((e) => e.type === group.type)
          if (!el) return null
          const isConn = el.category === 'connections'
          const isOpen = openGroup === group.type

          return (
            <div key={group.type} className="bz-cell">
              <div
                className={`bz-icon${isConn ? ' bz-icon--disabled' : ''}`}
                onMouseDown={isConn ? undefined : (e) => {
                  e.preventDefault()
                  onStartCreate(el.type, e.nativeEvent)
                }}
                title={t(el.labelKey)}
              >
                <BpmnElementIcon type={group.type} size={28} />
              </div>
              {group.variants.length > 0 && (
                <button
                  className={`bz-chevron-btn${isOpen ? ' bz-chevron-btn--open' : ''}`}
                  onClick={(e) => handleChevronClick(group.type, e)}
                  title="Mostrar variantes"
                >
                  <ChevronDown size={9} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {openGroup && flyoutPos && createPortal(
        <div
          ref={flyoutRef}
          className="bz-flyout"
          style={{ position: 'fixed', top: flyoutPos.top, left: flyoutPos.left }}
        >
          {BIZAGI_GROUPS.find((g) => g.type === openGroup)?.variants.map((vType) => {
            const el = BPMN_ELEMENTS.find((e) => e.type === vType)
            if (!el) return null
            return (
              <div
                key={vType}
                className="bz-flyout-item"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setOpenGroup(null)
                  setFlyoutPos(null)
                  onStartCreate(el.type, e.nativeEvent)
                }}
              >
                <BpmnElementIcon type={vType} size={18} />
                <span>{t(el.labelKey)}</span>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Grid mode item ───────────────────────────────────────────────────────────

interface PaletteItemProps {
  type: string
  bpmnType: string
  category: BpmnCategory
  label: string
  onStartCreate: (bpmnType: string, event: MouseEvent) => void
}

function PaletteItem({ type, bpmnType, category, label, onStartCreate }: PaletteItemProps) {
  if (category === 'connections') {
    return (
      <div className="pal-item pal-item--disabled" title={label}>
        <BpmnElementIcon type={type} size={26} />
        <span className="tt">{label}</span>
      </div>
    )
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    onStartCreate(type, e.nativeEvent)
  }

  return (
    <div
      className="pal-item"
      onMouseDown={handleMouseDown}
      title={label}
    >
      <BpmnElementIcon type={type} size={26} />
      <span className="tt">{label}</span>
    </div>
  )
}
