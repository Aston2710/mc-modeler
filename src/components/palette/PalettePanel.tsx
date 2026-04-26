import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { BPMN_ELEMENTS, CATEGORY_LABELS, type BpmnCategory } from '@/domain/bpmnElements'
import { BpmnElementIcon } from './BpmnElementIcon'

interface PalettePanelProps {
  collapsed: boolean
  onToggle: () => void
}

const CATEGORIES: BpmnCategory[] = ['events', 'activities', 'gateways', 'connections', 'containers']

export function PalettePanel({ collapsed, onToggle }: PalettePanelProps) {
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
                      <PaletteItem key={el.type} type={el.type} label={t(el.labelKey)} />
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
                    <PaletteItem key={el.type} type={el.type} label={t(el.labelKey)} />
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

function PaletteItem({ type, label }: { type: string; label: string }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('bpmn-element-type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className="pal-item"
      draggable
      onDragStart={handleDragStart}
      title={label}
    >
      <BpmnElementIcon type={type} size={26} />
      <span className="tt">{label}</span>
    </div>
  )
}
