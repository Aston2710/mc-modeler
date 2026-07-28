import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Search, Upload, Plus, FileText, Sun, Moon, FolderPlus, Folder, Share2, Trash2, LogOut, ArrowUpDown, ArrowUp, ArrowDown, Clock, CalendarDays, ArrowDownAZ, Shapes, ImageIcon, LayoutGrid, List, Clock3, ArrowLeftRight, MoreHorizontal, ChevronRight, ExternalLink } from 'lucide-react'
import { ImageGallery } from '@/components/images/ImageGallery'
import { Brand } from '@/components/layout/Brand'
import { useDiagramStore } from '@/store/diagramStore'
import { useUIStore } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useCollabStore } from '@/store/collabStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatRelativeTime } from '@/utils/dateFormatter'
import { compareDiagrams, compareProjects, NATURAL_DIR } from '@/utils/diagramSort'
import { useDiagramsPresence } from '@/hooks/useDiagramsPresence'
import { initialsOf, type ParticipantMeta } from '@/collab/presence'
import type { CollaboratorRole, Diagram, DiagramSortKey, DiagramListFilter } from '@/domain/types'

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showAllProjects, setShowAllProjects] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K enfoca la búsqueda global.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
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

  // Presencia en vivo por tarjeta: solo dentro de un proyecto abierto (acotado).
  // Se usa `scoped` (todos los del proyecto), no `filtered`, para no re-suscribir
  // al buscar/ordenar. En "Todos" no se suscribe (serían demasiados canales).
  const presenceIds = openProjectId ? scoped.map((d) => d.id) : []
  const presenceByDiagram = useDiagramsPresence(presenceIds)

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

  // Navegar a un destino (Todos/Recientes/…): sale del proyecto y fija el filtro.
  const goToFilter = (f: DiagramListFilter) => { setOpenProjectId(null); setFilter(f) }
  // Abrir un proyecto: entra a su ámbito y muestra todo (sin filtro heredado confuso).
  const openProjectFolder = (id: string) => { setOpenProjectId(id); setFilter('all') }

  const navActive = (f: DiagramListFilter) => !openProjectId && filter === f

  return (
    <div className="home">
      {/* ── Barra superior global ── */}
      <div className="home-toolbar">
        <Brand />
        <div className="home-globalsearch">
          <Search size={15} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('diagrams.searchAll', 'Buscar en todos los diagramas y carpetas…')}
          />

        </div>
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

      {/* ── Cuerpo: sidebar de navegación + contenido ── */}
      <div className="home-shell">
        <aside className="home-side">
          <nav className="home-nav-group">
            <button className={`home-nav ${navActive('all') ? 'active' : ''}`} onClick={() => goToFilter('all')}>
              <LayoutGrid size={16} />
              <span className="hn-label">{t('diagrams.filters.all')}</span>
              <span className="hn-count">{diagrams.length}</span>
            </button>
            <button className={`home-nav ${navActive('recent') ? 'active' : ''}`} onClick={() => goToFilter('recent')}>
              <Clock3 size={16} />
              <span className="hn-label">{t('diagrams.filters.recent')}</span>
            </button>
            {isSupabaseConfigured && (
              <button className={`home-nav ${navActive('shared') ? 'active' : ''}`} onClick={() => goToFilter('shared')}>
                <ArrowLeftRight size={16} />
                <span className="hn-label">{t('diagrams.filters.shared')}</span>
                {sharedCount > 0 && <span className="hn-count">{sharedCount}</span>}
              </button>
            )}
          </nav>

          {isSupabaseConfigured && (
            <div className="home-side-section">
              <div className="home-side-label">
                {t('projects.title')}
                {onNewProject && (
                  <button className="hs-add" onClick={onNewProject} title={t('projects.new')}>
                    <FolderPlus size={14} />
                  </button>
                )}
              </div>
              <div className="home-tree">
                {(showAllProjects ? sortedProjects : sortedProjects.slice(0, 6)).map((p) => (
                  <button
                    key={p.id}
                    className={`home-nav ${openProjectId === p.id ? 'active' : ''}`}
                    onClick={() => openProjectFolder(p.id)}
                  >
                    <Folder size={15} />
                    <span className="hn-label">{p.name}</span>
                    <span className="hn-count">{diagramCountByProject(p.id)}</span>
                  </button>
                ))}
                {sortedProjects.length > 6 && !showAllProjects && (
                  <button className="home-tree-more" onClick={() => setShowAllProjects(true)}>
                    + {sortedProjects.length - 6} {t('projects.more', 'carpetas más')}
                  </button>
                )}
                {sortedProjects.length === 0 && (
                  <div className="home-tree-empty">{t('projects.empty', 'Sin proyectos aún')}</div>
                )}
              </div>
            </div>
          )}
        </aside>

        <main className="home-main">
          {/* Breadcrumb + acciones */}
          <div className="home-crumb-row">
            <div className="home-crumb">
              <button className="hc-link" onClick={() => setOpenProjectId(null)}>{t('diagrams.title')}</button>
              {openProject && (
                <>
                  <ChevronRight size={14} className="hc-sep" />
                  <span className="hc-current">{openProject.name}</span>
                </>
              )}
            </div>
            <div className="home-main-actions">
              {openProject && onShareProject && rolesByProject[openProject.id] === 'owner' && (
                <button className="btn-ghost" onClick={() => onShareProject(openProject.id, openProject.name)}>
                  <Share2 size={14} />
                  {t('projects.share')}
                </button>
              )}
              <button className="btn-ghost" onClick={() => setGalleryOpen(true)}>
                <ImageIcon size={14} />
                {t('images.libraryButton')}
              </button>
              <button className="btn-ghost" onClick={() => onImport(openProject ? openProject.id : null)}>
                <Upload size={14} />
                {t('toolbar.import')}
              </button>
              <button
                className="btn-primary"
                onClick={() => (openProject && onNewInProject ? onNewInProject(openProject.id) : onNew())}
              >
                <Plus size={14} />
                {t('toolbar.newDiagram')}
              </button>
            </div>
          </div>

          <div className="home-subrow">
            <SortControl />
            <div style={{ flex: 1 }} />
            <div className="home-viewtog">
              <button className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')} title={t('diagrams.view.grid', 'Cuadrícula')}>
                <LayoutGrid size={15} />
              </button>
              <button className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} title={t('diagrams.view.list', 'Lista')}>
                <List size={15} />
              </button>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="diagrams-grid">
              <div
                className="create-card"
                onClick={() => (openProject && onNewInProject ? onNewInProject(openProject.id) : onNew())}
              >
                <div>
                  <div className="create-icon"><Plus size={20} /></div>
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
                  participants={presenceByDiagram[d.id] ?? []}
                />
              ))}
            </div>
          ) : (
            <div className="diagram-rows">
              {filtered.map((d) => (
                <DiagramRow
                  key={d.id}
                  diagram={d}
                  role={rolesByDiagram[d.id] ?? null}
                  onOpen={() => onOpen(d.id)}
                  onDelete={() => setConfirmDeleteId(d.id)}
                  language={language}
                  participants={presenceByDiagram[d.id] ?? []}
                />
              ))}
            </div>
          )}
        </main>
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
  participants?: ParticipantMeta[]
}

function DiagramCard({ diagram, role, onOpen, onDelete, language, participants }: DiagramCardProps) {
  const { t } = useTranslation()
  const isShared = role === 'editor' || role === 'viewer'

  return (
    <div className="diagram-card" style={{ position: 'relative' }} onClick={onOpen}>
      {isShared && (
        <span className="shared-badge">
          {role === 'viewer' ? t('share.roleViewer') : t('share.roleEditor')}
        </span>
      )}
      {!isShared && <CardMenu onOpen={onOpen} onDelete={onDelete} />}
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
          <span className="num">{formatRelativeTime(diagram.updatedAt, language)}</span>
          {diagram.elementCount > 0 && (
            <>
              <span style={{ color: 'var(--border-strong)' }}>·</span>
              <span className="num">{t('diagrams.card.elements_other', { count: diagram.elementCount })}</span>
            </>
          )}
        </div>
        <CardPresence participants={participants} />
      </div>
    </div>
  )
}

function DiagramRow({ diagram, role, onOpen, onDelete, language, participants }: DiagramCardProps) {
  const { t } = useTranslation()
  const isShared = role === 'editor' || role === 'viewer'
  return (
    <div className="diagram-row" onClick={onOpen}>
      <span className="dr-icon"><FileText size={16} /></span>
      <span className="dr-name">{diagram.name}</span>
      {isShared && (
        <span className="dr-role">{role === 'viewer' ? t('share.roleViewer') : t('share.roleEditor')}</span>
      )}
      <CardPresence participants={participants} />
      <span className="dr-meta num">
        {formatRelativeTime(diagram.updatedAt, language)}
        {diagram.elementCount > 0 && ` · ${t('diagrams.card.elements_other', { count: diagram.elementCount })}`}
      </span>
      {!isShared && <CardMenu onOpen={onOpen} onDelete={onDelete} />}
    </div>
  )
}

/** Avatares pequeños de quién está editando el diagrama en vivo (0 → no renderiza
 *  nada, así la tarjeta no cambia de aspecto salvo cuando hay alguien presente). */
function CardPresence({ participants }: { participants?: ParticipantMeta[] }) {
  if (!participants || participants.length === 0) return null
  const shown = participants.slice(0, 4)
  const extra = participants.length - shown.length
  return (
    <div className="card-presence" title={`${participants.length} editando`}>
      {shown.map((p) => (
        <span key={p.userId} className="pa" style={{ background: p.color }} title={p.name}>
          {initialsOf(p.name)}
        </span>
      ))}
      {extra > 0 && <span className="pa pa--more">+{extra}</span>}
    </div>
  )
}

/** Menú "···" de una tarjeta de diagrama. Reemplaza la antigua "X" de borrado.
 *  Solo acciones existentes: Abrir / Eliminar. Portal para no recortarse en la tarjeta. */
function CardMenu({ onOpen, onDelete }: { onOpen: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 176) })
    setOpen(true)
  }

  return (
    <>
      <button ref={btnRef} className="card-kebab" onClick={toggle} title={t('diagrams.actions.more', 'Más')}>
        <MoreHorizontal size={15} />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="menu-dropdown"
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: 176 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="menu-item" role="menuitem" onClick={() => { setOpen(false); onOpen() }}>
            <span className="mi-ico"><ExternalLink size={15} /></span>
            <span className="mi-label">{t('diagrams.actions.open', 'Abrir')}</span>
          </button>
          <div className="menu-sep" role="separator" />
          <button className="menu-item" role="menuitem" onClick={() => { setOpen(false); onDelete() }}>
            <span className="mi-ico" style={{ color: 'var(--error)' }}><Trash2 size={15} /></span>
            <span className="mi-label" style={{ color: 'var(--error)' }}>{t('diagrams.actions.delete')}</span>
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
