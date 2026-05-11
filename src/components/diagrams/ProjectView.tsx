import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Plus, FileText, LayoutGrid, List, X } from 'lucide-react'
import { useDiagramStore } from '@/store/diagramStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { formatRelativeTime } from '@/utils/dateFormatter'
import type { Diagram } from '@/domain/types'

interface ProjectViewProps {
  onOpen: (id: string) => void
  onNew: () => void
  onClose: () => void
}

export function ProjectView({ onOpen, onNew, onClose }: ProjectViewProps) {
  const { t } = useTranslation()
  const diagrams = useDiagramStore((s) => s.diagrams)
  const language = usePreferencesStore((s) => s.language)

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const filtered = useMemo(() => {
    return diagrams
      .filter((d) => !search || d.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [diagrams, search])

  return (
    <div className="project-view-overlay" onClick={onClose}>
      <div className="project-view" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="pv-header">
          <div className="pv-title">
            <span>{t('diagrams.title')}</span>
            <span className="pv-count">{filtered.length}</span>
          </div>

          <div className="pv-header-actions">
            <div className="pv-search">
              <Search size={13} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('toolbar.myDiagrams') + '...'}
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X size={11} />
                </button>
              )}
            </div>

            <div className="pv-view-toggle">
              <button
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
                title="Vista cuadrícula"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
                title="Vista lista"
              >
                <List size={14} />
              </button>
            </div>

            <button className="pv-close" onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={`pv-content ${viewMode === 'list' ? 'pv-list' : 'pv-grid'}`}>
          {filtered.map((d) =>
            viewMode === 'grid'
              ? <ProjectGridCard key={d.id} diagram={d} language={language} onOpen={() => { onOpen(d.id); onClose() }} />
              : <ProjectListCard key={d.id} diagram={d} language={language} onOpen={() => { onOpen(d.id); onClose() }} />
          )}

          {filtered.length === 0 && (
            <div className="pv-empty">
              <FileText size={32} />
              <p>{search ? 'Sin resultados' : 'No hay diagramas aún'}</p>
            </div>
          )}
        </div>

        {/* FAB — new diagram */}
        <button className="pv-fab" onClick={onNew} title={t('toolbar.newDiagram')}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}

interface CardProps {
  diagram: Diagram
  language: string
  onOpen: () => void
}

function ProjectGridCard({ diagram, language, onOpen }: CardProps) {
  return (
    <div className="pv-grid-card" onClick={onOpen}>
      <div className="pv-grid-thumb">
        {diagram.thumbnail
          ? <img src={diagram.thumbnail} alt={diagram.name} />
          : <div className="pv-thumb-placeholder"><FileText size={22} /></div>
        }
      </div>
      <div className="pv-grid-meta">
        <span className="pv-gm-name">{diagram.name}</span>
        <span className="pv-gm-date">{formatRelativeTime(diagram.updatedAt, language)}</span>
      </div>
    </div>
  )
}

function ProjectListCard({ diagram, language, onOpen }: CardProps) {
  return (
    <div className="pv-list-row" onClick={onOpen}>
      <div className="pv-lr-icon"><FileText size={15} /></div>
      <div className="pv-lr-thumb">
        {diagram.thumbnail ? <img src={diagram.thumbnail} alt={diagram.name} /> : null}
      </div>
      <div className="pv-lr-name">{diagram.name}</div>
      <div className="pv-lr-date">{formatRelativeTime(diagram.updatedAt, language)}</div>
    </div>
  )
}