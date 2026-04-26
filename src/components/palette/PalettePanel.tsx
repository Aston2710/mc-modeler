import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { BPMN_ELEMENTS, CATEGORY_LABELS, type BpmnCategory } from '@/domain/bpmnElements'
import { BpmnElementIcon } from './BpmnElementIcon'

interface PalettePanelProps {
  collapsed: boolean
  onToggle: () => void
  onStartCreate: (bpmnType: string, event: MouseEvent) => void
}

const CATEGORIES: BpmnCategory[] = ['events', 'activities', 'gateways', 'connections', 'containers']

export function PalettePanel({ collapsed, onToggle, onStartCreate }: PalettePanelProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})

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
    </div>
  )
}

interface PaletteItemProps {
  type: string
  bpmnType: string
  category: BpmnCategory
  label: string
  onStartCreate: (bpmnType: string, event: MouseEvent) => void
}

function PaletteItem({ type, bpmnType, category, label, onStartCreate }: PaletteItemProps) {
  if (category === 'connections') {
    // Connections are drawn by dragging from element hover-handles on canvas
    return (
      <div className="pal-item pal-item--disabled" title={label}>
        <BpmnElementIcon type={type} size={26} />
        <span className="tt">{label}</span>
      </div>
    )
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault() // prevent text selection
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
