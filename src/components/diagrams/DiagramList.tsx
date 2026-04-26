import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Upload, Plus, FileText, Sun, Moon, X } from 'lucide-react'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { formatRelativeTime } from '@/utils/dateFormatter'
import type { Diagram } from '@/domain/types'

interface DiagramListProps {
  onOpen: (id: string) => void
  onNew: () => void
  onImport: () => void
}

export function DiagramList({ onOpen, onNew, onImport }: DiagramListProps) {
  const { t } = useTranslation()
  const diagrams = useDiagramStore((s) => s.diagrams)
  const deleteDiagram = useDiagramStore((s) => s.deleteDiagram)
  const filter = useUIStore((s) => s.diagramListFilter)
  const search = useUIStore((s) => s.diagramListSearch)
  const setFilter = useUIStore((s) => s.setDiagramListFilter)
  const setSearch = useUIStore((s) => s.setDiagramListSearch)
  const language = usePreferencesStore((s) => s.language)
  const theme = usePreferencesStore((s) => s.theme)
  const setTheme = usePreferencesStore((s) => s.setTheme)
  const setLanguage = usePreferencesStore((s) => s.setLanguage)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const filtered = diagrams
    .filter((d) => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'recent') {
        const diff = Date.now() - new Date(d.updatedAt).getTime()
        return diff < 7 * 24 * 60 * 60 * 1000
      }
      return true
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const handleDelete = async (id: string) => {
    await deleteDiagram(id)
    setConfirmDeleteId(null)
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <div className="home">
      <div className="home-toolbar">
        <button className="brand" onClick={() => {}}>
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="6" cy="6" r="3" stroke="white" strokeWidth="2" />
              <path d="M9 6h6M15 6l-3 3M15 6l-3-3" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <rect x="14" y="9" width="6" height="6" rx="1" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <span className="brand-name">Flujo<span className="dot">.</span></span>
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          / {t('toolbar.myDiagrams')}
        </span>
        <div style={{ flex: 1 }} />
        <div className="lang-toggle">
          <button className={language === 'es' ? 'active' : ''} onClick={() => setLanguage('es')}>ES</button>
          <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
        </div>
        <button className="icon-btn" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div className="home-content">
        <div className="home-hero">
          <div>
            <h1>{t('diagrams.title')}</h1>
            <p>
              {t('diagrams.subtitle_other', { count: diagrams.length })}
            </p>
          </div>
          <div className="home-actions">
            <div className="home-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('toolbar.myDiagrams') + '...'}
              />
            </div>
            <button className="btn-ghost" onClick={onImport}>
              <Upload size={14} />
              {t('toolbar.import')}
            </button>
            <button className="btn-primary" onClick={onNew}>
              <Plus size={14} />
              {t('toolbar.newDiagram')}
            </button>
          </div>
        </div>

        <div className="filter-bar">
          <button
            className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('diagrams.filters.all')}
            <span className="fp-count">{diagrams.length}</span>
          </button>
          <button
            className={`filter-pill ${filter === 'recent' ? 'active' : ''}`}
            onClick={() => setFilter('recent')}
          >
            {t('diagrams.filters.recent')}
          </button>
        </div>

        <div className="diagrams-grid">
          {/* Create card */}
          <div className="create-card" onClick={onNew}>
            <div>
              <div className="create-icon">
                <Plus size={20} />
              </div>
              <div className="create-label">{t('diagrams.createCard.title')}</div>
              <div className="create-sub">{t('diagrams.createCard.subtitle')}</div>
            </div>
          </div>

          {filtered.map((d) => (
            <DiagramCard
              key={d.id}
              diagram={d}
              onOpen={() => onOpen(d.id)}
              onDelete={() => setConfirmDeleteId(d.id)}
              language={language}
            />
          ))}
        </div>
      </div>

      {confirmDeleteId && (
        <div className="modal-backdrop" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal" style={{ width: 'min(400px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{t('diagrams.actions.delete')}</div>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13 }}>{t('diagrams.deleteConfirm')}</p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setConfirmDeleteId(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--error)' }}
                onClick={() => handleDelete(confirmDeleteId)}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface DiagramCardProps {
  diagram: Diagram
  onOpen: () => void
  onDelete: () => void
  language: string
}

function DiagramCard({ diagram, onOpen, onDelete, language }: DiagramCardProps) {
  const { t } = useTranslation()

  return (
    <div className="diagram-card" style={{ position: 'relative' }} onClick={onOpen}>
      <div className="diagram-thumb">
        {diagram.thumbnail ? (
          <img src={diagram.thumbnail} alt={diagram.name} />
        ) : (
          <div className="diagram-thumb-placeholder">
            <FileText size={24} />
          </div>
        )}
      </div>
      <div className="diagram-meta">
        <div className="dm-name">{diagram.name}</div>
        <div className="dm-sub">
          <span>{formatRelativeTime(diagram.updatedAt, language)}</span>
          {diagram.elementCount > 0 && (
            <>
              <span style={{ color: 'var(--border-strong)' }}>·</span>
              <span>{t('diagrams.card.elements_other', { count: diagram.elementCount })}</span>
            </>
          )}
        </div>
        <div className="dm-tags">
          <span className="dm-tag">BPMN 2.0</span>
        </div>
      </div>
      <button
        className="icon-btn"
        style={{ position: 'absolute', top: 8, right: 8, opacity: 0.7 }}
        title={t('diagrams.actions.delete')}
        onClick={(e) => { e.stopPropagation(); onDelete() }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
