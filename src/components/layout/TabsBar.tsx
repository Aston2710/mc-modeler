import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, X, Plus } from 'lucide-react'
import { useDiagramStore } from '@/store/diagramStore'

interface TabsBarProps {
  onNew: () => void
}

export function TabsBar({ onNew }: TabsBarProps) {
  const { t } = useTranslation()
  const tabs = useDiagramStore((s) => s.tabs)
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const setActiveTab = useDiagramStore((s) => s.setActiveTab)
  const closeTab = useDiagramStore((s) => s.closeTab)
  const renameDiagram = useDiagramStore((s) => s.renameDiagram)

  const [editingId, setEditingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDoubleClick = (id: string) => {
    setEditingId(id)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleRenameBlur = (id: string, value: string) => {
    if (value.trim()) {
      void renameDiagram(id, value.trim())  // also updates tab name in store
    }
    setEditingId(null)
  }

  if (!tabs.length) return null

  return (
    <div className="tabs-bar">
      <div className="tabs-scroll">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`dtab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab.id)}
          >
            <span className="dt-icon">
              <FileText size={13} />
            </span>
            <span className="dt-name">
              {editingId === tab.id ? (
                <input
                  ref={inputRef}
                  defaultValue={tab.name}
                  onBlur={(e) => handleRenameBlur(tab.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') { setEditingId(null) }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                tab.name
              )}
            </span>
            {tab.dirty && <span className="dt-dirty" />}
            <button
              className="dt-close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
      <button className="tab-add" onClick={onNew} title={t('toolbar.newDiagram')}>
        <Plus size={14} />
      </button>
    </div>
  )
}
