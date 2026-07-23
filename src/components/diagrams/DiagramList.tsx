import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Upload, Plus, FileText, Sun, Moon, X, FolderPlus, Folder, Share2, ArrowLeft, Trash2, LogOut, ArrowUpDown, ArrowUp, ArrowDown, Clock, CalendarDays, ArrowDownAZ, Shapes, ImageIcon } from 'lucide-react'
import { ImageGallery } from '@/components/images/ImageGallery'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useCollabStore } from '@/store/collabStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatRelativeTime } from '@/utils/dateFormatter'
import { compareDiagrams, compareProjects, NATURAL_DIR } from '@/utils/diagramSort'
import type { CollaboratorRole, Diagram, DiagramSortKey } from '@/domain/types'

interface DiagramListProps {
  onOpen: (id: string) => void
  onNew: () => void
  onImport: (projectId?: string | null) => void
  onNewProject?: () => void
  onShareProject?: (projectId: string, projectName: string) => void
  onNewInProject?: (projectId: string) => void
  onSignOut?: () => void
}

export function DiagramList({ onOpen, onNew, onImport, onNewProject, onShareProject, onNewInProject, onSignOut }: DiagramListProps) {
  const { t } = useTranslation()
  const diagrams = useDiagramStore((s) => s.diagrams)
  const projects = useDiagramStore((s) => s.projects)
  const deleteDiagram = useDiagramStore((s) => s.deleteDiagram)
  const deleteProject = useDiagramStore((s) => s.deleteProject)
  const filter = useUIStore((s) => s.diagramListFilter)
  const search = useUIStore((s) => s.diagramListSearch)
  const setFilter = useUIStore((s) => s.setDiagramListFilter)
  const setSearch = useUIStore((s) => s.setDiagramListSearch)
  const language = usePreferencesStore((s) => s.language)
  const theme = usePreferencesStore((s) => s.theme)
  const setTheme = usePreferencesStore((s) => s.setTheme)
  const setLanguage = usePreferencesStore((s) => s.setLanguage)
  const rolesByDiagram = useCollabStore((s) => s.rolesByDiagram)
  const rolesByProject = useCollabStore((s) => s.rolesByProject)
  const diagramSort = usePreferencesStore((s) => s.diagramSort)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  // Persistir el proyecto abierto para que sobreviva ir al editor y volver.
  const [openProjectId, setOpenProjectIdState] = useState<string | null>(
    () => sessionStorage.getItem('flujo:openProject')
  )
  const setOpenProjectId = (id: string | null) => {
    if (id) sessionStorage.setItem('flujo:openProject', id)
    else sessionStorage.removeItem('flujo:openProject')
    setOpenProjectIdState(id)
  }

  const openProject = openProjectId ? projects.find((p) => p.id === openProjectId) ?? null : null

  const isSharedDiagram = (d: Diagram) => {
    const role = rolesByDiagram[d.id]
    return role === 'editor' || role === 'viewer'
  }

  // Ámbito visible: dentro de un proyecto → solo sus diagramas; en la raíz → solo sueltos.
  const scoped = diagrams.filter((d) => {
    if (openProjectId) return d.projectId === openProjectId
    if (d.projectId) {
      // Si el proyecto padre es visible, el diagrama se navega desde su carpeta.
      // Si no es visible (acceso solo al diagrama, sin acceso al proyecto),
      // mostrar en raíz para que el usuario pueda acceder.
      const projectIsVisible = projects.some((p) => p.id === d.projectId)
      if (projectIsVisible) return false
    }
    return true
  })

  const sharedCount = scoped.filter(isSharedDiagram).length

  const filtered = scoped
    .filter((d) => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'recent') {
        const diff = Date.now() - new Date(d.updatedAt).getTime()
        return diff < 7 * 24 * 60 * 60 * 1000
      }
      if (filter === 'own') return !isSharedDiagram(d)
      if (filter === 'shared') return isSharedDiagram(d)
      return true
    })
    .sort(compareDiagrams(diagramSort))

  const diagramCountByProject = (projectId: string) =>
    diagrams.filter((d) => d.projectId === projectId).length

  const sortedProjects = [...projects].sort(compareProjects(diagramSort, diagramCountByProject))

  const handleDelete = async (id: string) => {
    if (id.startsWith('project:')) {
      await deleteProject(id.slice('project:'.length))
    } else {
      await deleteDiagram(id)
    }
    setConfirmDeleteId(null)
  }

  const confirmIsProject = confirmDeleteId?.startsWith('project:') ?? false

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
        {isSupabaseConfigured && onSignOut && (
          <button className="icon-btn" onClick={onSignOut} title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        )}
      </div>

      <div className="home-content">
        <div className="home-hero">
          <div>
            {openProject ? (
              <button className="btn-ghost" style={{ marginBottom: 8 }} onClick={() => setOpenProjectId(null)}>
                <ArrowLeft size={14} /> {t('projects.title')}
              </button>
            ) : null}
            <h1>{openProject ? openProject.name : t('diagrams.title')}</h1>
            <p>
              {openProject
                ? t('projects.count', { count: filtered.length })
                : t('diagrams.subtitle_other', { count: diagrams.length })}
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
            {openProject && onShareProject && (rolesByProject[openProject.id] === 'owner') && (
              <button className="btn-ghost" onClick={() => onShareProject(openProject.id, openProject.name)}>
                <Share2 size={14} />
                {t('projects.share')}
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => onImport(openProject ? openProject.id : null)}
            >
              <Upload size={14} />
              {t('toolbar.import')}
            </button>
            <button className="btn-ghost" onClick={() => setGalleryOpen(true)}>
              <ImageIcon size={14} />
              {t('images.libraryButton')}
            </button>
            {!openProject && isSupabaseConfigured && onNewProject && (
              <button className="btn-ghost" onClick={onNewProject}>
                <FolderPlus size={14} />
                {t('projects.new')}
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => (openProject && onNewInProject ? onNewInProject(openProject.id) : onNew())}
            >
              <Plus size={14} />
              {t('toolbar.newDiagram')}
            </button>
          </div>
        </div>

        {/* Sección de proyectos (solo en la vista raíz y en modo nube) */}
        {!openProject && isSupabaseConfigured && projects.length > 0 && (
          <div className="projects-row">
            {sortedProjects.map((p) => (
              <div key={p.id} className="project-card" onClick={() => setOpenProjectId(p.id)}>
                <div className="project-card-icon"><Folder size={18} /></div>
                <div className="project-card-body">
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-meta">{t('projects.count', { count: diagramCountByProject(p.id) })}</div>
                </div>
                {rolesByProject[p.id] === 'owner' && (
                  <button
                    className="icon-btn"
                    title={t('projects.delete')}
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(`project:${p.id}`) }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="filter-bar">
          <button
            className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('diagrams.filters.all')}
            <span className="fp-count">{scoped.length}</span>
          </button>
          <button
            className={`filter-pill ${filter === 'recent' ? 'active' : ''}`}
            onClick={() => setFilter('recent')}
          >
            {t('diagrams.filters.recent')}
          </button>
          {isSupabaseConfigured && (
            <>
              <button
                className={`filter-pill ${filter === 'own' ? 'active' : ''}`}
                onClick={() => setFilter('own')}
              >
                {t('diagrams.filters.own')}
                <span className="fp-count">{scoped.length - sharedCount}</span>
              </button>
              <button
                className={`filter-pill ${filter === 'shared' ? 'active' : ''}`}
                onClick={() => setFilter('shared')}
              >
                {t('diagrams.filters.shared')}
                <span className="fp-count">{sharedCount}</span>
              </button>
            </>
          )}
          <SortControl />
        </div>

        <div className="diagrams-grid">
          {/* Create card — dentro de un proyecto crea ahí; si no, suelto */}
          <div
            className="create-card"
            onClick={() => (openProject && onNewInProject ? onNewInProject(openProject.id) : onNew())}
          >
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
              role={rolesByDiagram[d.id] ?? null}
              onOpen={() => onOpen(d.id)}
              onDelete={() => setConfirmDeleteId(d.id)}
              language={language}
            />
          ))}
        </div>
      </div>

      {galleryOpen && (
        <ImageGallery projectId={openProjectId} onClose={() => setGalleryOpen(false)} />
      )}

      {confirmDeleteId && (
        <div className="modal-backdrop" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal" style={{ width: 'min(400px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{confirmIsProject ? t('projects.delete') : t('diagrams.actions.delete')}</div>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 13 }}>{confirmIsProject ? t('projects.deleteConfirm') : t('diagrams.deleteConfirm')}</p>
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

const SORT_OPTIONS: { key: DiagramSortKey; Icon: typeof Clock }[] = [
  { key: 'updated', Icon: Clock },
  { key: 'created', Icon: CalendarDays },
  { key: 'name', Icon: ArrowDownAZ },
  { key: 'elements', Icon: Shapes },
]

function SortControl() {
  const { t } = useTranslation()
  const diagramSort = usePreferencesStore((s) => s.diagramSort)
  const setDiagramSort = usePreferencesStore((s) => s.setDiagramSort)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const pick = (key: DiagramSortKey) => {
    if (key === diagramSort.key) {
      // Repetir el criterio activo invierte la dirección
      void setDiagramSort({ key, dir: diagramSort.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      void setDiagramSort({ key, dir: NATURAL_DIR[key] })
    }
  }

  const dirLabel = (key: DiagramSortKey) => {
    if (key === 'name') return diagramSort.dir === 'asc' ? t('diagrams.sort.az') : t('diagrams.sort.za')
    if (key === 'elements') return diagramSort.dir === 'desc' ? t('diagrams.sort.mostFirst') : t('diagrams.sort.leastFirst')
    return diagramSort.dir === 'desc' ? t('diagrams.sort.newestFirst') : t('diagrams.sort.oldestFirst')
  }

  const DirIcon = diagramSort.dir === 'desc' ? ArrowDown : ArrowUp

  return (
    <div className="sort-wrap" ref={wrapRef}>
      <button
        className="sort-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowUpDown size={13} />
        <span className="st-prefix">{t('diagrams.sort.label')}:</span>
        <span className="st-label">{t(`diagrams.sort.${diagramSort.key}`)}</span>
        <DirIcon size={12} />
      </button>
      {open && (
        <div className="sort-menu" role="listbox" aria-label={t('diagrams.sort.title')}>
          <div className="sort-menu-title">{t('diagrams.sort.title')}</div>
          {SORT_OPTIONS.map(({ key, Icon }) => (
            <button
              key={key}
              className="sort-option"
              role="option"
              aria-selected={diagramSort.key === key}
              onClick={() => pick(key)}
            >
              <Icon size={14} className="so-icon" />
              {t(`diagrams.sort.${key}`)}
              {diagramSort.key === key && (
                <span className="so-dir">
                  <DirIcon size={11} />
                  {dirLabel(key)}
                </span>
              )}
            </button>
          ))}
          <div className="sort-menu-hint">{t('diagrams.sort.hint')}</div>
        </div>
      )}
    </div>
  )
}

interface DiagramCardProps {
  diagram: Diagram
  role: CollaboratorRole | null
  onOpen: () => void
  onDelete: () => void
  language: string
}

function DiagramCard({ diagram, role, onOpen, onDelete, language }: DiagramCardProps) {
  const { t } = useTranslation()
  const isShared = role === 'editor' || role === 'viewer'

  return (
    <div className="diagram-card" style={{ position: 'relative' }} onClick={onOpen}>
      {isShared && (
        <span className="shared-badge">
          {role === 'viewer' ? t('share.roleViewer') : t('share.roleEditor')}
        </span>
      )}
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
      {!isShared && (
        <button
          className="icon-btn"
          style={{ position: 'absolute', top: 8, right: 8, opacity: 0.7 }}
          title={t('diagrams.actions.delete')}
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
