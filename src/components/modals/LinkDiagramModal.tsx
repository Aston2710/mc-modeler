import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, FileText, Plus, Search } from 'lucide-react'
import { useDiagramStore } from '@/store/diagramStore'
import { formatRelativeTime } from '@/utils/dateFormatter'
import { usePreferencesStore } from '@/store/preferencesStore'

interface LinkDiagramModalProps {
  /** Proyecto al que se limita la selección (null = sueltos del usuario). */
  projectId: string | null
  /** Diagrama actual, se excluye de la lista. */
  currentDiagramId: string | null
  onPick: (diagramId: string) => void
  onCreateAndLink: (name: string) => void
  onCancel: () => void
}

export function LinkDiagramModal({ projectId, currentDiagramId, onPick, onCreateAndLink, onCancel }: LinkDiagramModalProps) {
  const { t } = useTranslation()
  const diagrams = useDiagramStore((s) => s.diagrams)
  const language = usePreferencesStore((s) => s.language)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const candidates = useMemo(() => {
    return diagrams
      .filter((d) => d.id !== currentDiagramId)
      .filter((d) => (projectId ? d.projectId === projectId : !d.projectId))
      .filter((d) => !search || d.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [diagrams, currentDiagramId, projectId, search])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ width: 'min(520px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('link.title')}</div>
            <div className="modal-sub">{t('link.subtitle')}</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {creating ? (
            <form
              onSubmit={(e) => { e.preventDefault(); if (newName.trim()) onCreateAndLink(newName.trim()) }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div className="field">
                <label className="field-label">{t('link.newName')}</label>
                <input
                  className="f-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('link.newNamePlaceholder')}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={!newName.trim()}>
                  {t('link.createAndLink')}
                </button>
              </div>
            </form>
          ) : (
            <>
              <button className="btn-primary" onClick={() => setCreating(true)} style={{ justifyContent: 'center' }}>
                <Plus size={15} style={{ marginRight: 6 }} />
                {t('link.createNew')}
              </button>

              <div className="home-search" style={{ width: '100%' }}>
                <Search size={14} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('link.search')} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {candidates.map((d) => (
                  <div key={d.id} className="link-row" onClick={() => onPick(d.id)}>
                    <div className="link-row-thumb">
                      {d.thumbnail ? <img src={d.thumbnail} alt={d.name} /> : <FileText size={16} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="link-row-name">{d.name}</div>
                      <div className="link-row-date">{formatRelativeTime(d.updatedAt, language)}</div>
                    </div>
                  </div>
                ))}
                {candidates.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
                    {t('link.empty')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
