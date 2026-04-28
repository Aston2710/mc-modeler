import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import { BPMN_ELEMENTS, CATEGORY_LABELS, type BpmnCategory } from '@/domain/bpmnElements'
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
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [settingsOpen])

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
        <div ref={settingsRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            className={`sb-collapse-btn${settingsOpen ? ' active' : ''}`}
            onClick={() => setSettingsOpen((v) => !v)}
            title="Configuración"
          >
            <Settings2 size={14} />
          </button>
          {settingsOpen && (
            <div className="palette-settings-menu">
              <label className="palette-settings-item">
                <input
                  type="checkbox"
                  checked={paletteMode === 'dropdown'}
                  onChange={(e) => setPaletteMode(e.target.checked ? 'dropdown' : 'grid')}
                />
                <span>Modo desplegable</span>
              </label>
            </div>
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

      {paletteMode === 'dropdown' && !filtered ? (
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
                  onStartCreate(el.bpmnType, e.nativeEvent)
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
    onStartCreate(bpmnType, e.nativeEvent)
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
