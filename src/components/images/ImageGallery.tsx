import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload, Search, FolderPlus, Folder, Trash2, Pencil, ImageIcon, Wand2 } from 'lucide-react'
import { useImageStore } from '@/store/imageStore'
import { useUIStore } from '@/store/uiStore'
import { useDiagramStore } from '@/store/diagramStore'
import { fileToCompressedDataUrl } from '@/utils/imageCompress'
import { isStorageImageRef, resolveImageRef, blobToDataUrl } from '@/utils/imageStorage'
import { findPhotoDiagramCandidates, migrateCandidate } from '@/utils/migratePhotoDiagrams'
import { ImageThumb } from './ImageThumb'
import type { LibraryImage } from '@/domain/types'

async function resolveRefToDataUrl(ref: string): Promise<string | null> {
  if (ref.startsWith('data:')) return ref
  if (isStorageImageRef(ref)) return resolveImageRef(ref)
  try {
    const blob = await (await fetch(ref)).blob()
    return await blobToDataUrl(blob)
  } catch { return null }
}

interface ImageGalleryProps {
  /** Proyecto activo (limita el ámbito de la biblioteca). null = sueltas. */
  projectId: string | null
  onClose: () => void
  /** Si se pasa, la galería actúa como selector: clic en una imagen la elige. */
  onPick?: (image: LibraryImage) => void
}

export function ImageGallery({ projectId, onClose, onPick }: ImageGalleryProps) {
  const { t } = useTranslation()
  const images = useImageStore((s) => s.images)
  const folders = useImageStore((s) => s.folders)
  const loaded = useImageStore((s) => s.loaded)
  const loadAll = useImageStore((s) => s.loadAll)
  const upload = useImageStore((s) => s.upload)
  const rename = useImageStore((s) => s.rename)
  const remove = useImageStore((s) => s.remove)
  const move = useImageStore((s) => s.move)
  const createFolder = useImageStore((s) => s.createFolder)
  const deleteFolder = useImageStore((s) => s.deleteFolder)
  const addToast = useUIStore((s) => s.addToast)

  const [search, setSearch] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<LibraryImage | null>(null)
  const [migrating, setMigrating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  const scopeFolders = useMemo(
    () => folders.filter((f) => (projectId ? f.projectId === projectId : !f.projectId)),
    [folders, projectId]
  )

  const scopeImages = useMemo(() => {
    return images
      .filter((i) => (projectId ? i.projectId === projectId : !i.projectId))
      .filter((i) => (activeFolder ? i.folderId === activeFolder : true))
      .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  }, [images, projectId, activeFolder, search])

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        const dataUrl = await fileToCompressedDataUrl(file)
        const name = file.name.replace(/\.[^.]+$/, '')
        await upload({ dataUrl, name, projectId, folderId: activeFolder })
      }
    } catch {
      addToast({ type: 'error', title: t('images.uploadError') })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleNewFolder = async () => {
    const name = window.prompt(t('images.newFolderPrompt'))?.trim()
    if (!name) return
    // No duplicar nombres dentro del mismo ámbito (case-insensitive).
    if (scopeFolders.some((f) => f.name.trim().toLowerCase() === name.toLowerCase())) {
      addToast({ type: 'error', title: t('images.folderExists', { name }) })
      return
    }
    await createFolder(name, projectId)
  }

  const handleRename = async (image: LibraryImage) => {
    const name = window.prompt(t('images.renamePrompt'), image.name)
    if (name?.trim() && name.trim() !== image.name) await rename(image.id, name.trim())
  }

  const handleMigrate = async () => {
    setMigrating(true)
    try {
      const ds = useDiagramStore.getState()
      const candidates = await findPhotoDiagramCandidates(ds.diagrams, { ensureXml: ds.ensureXml })
      if (candidates.length === 0) { addToast({ type: 'info', title: t('images.migrateNone') }); return }
      if (!window.confirm(t('images.migrateSubtitle') + `\n(${candidates.length})`)) return
      let done = 0
      for (const cand of candidates) {
        try {
          await migrateCandidate(cand, {
            ensureXml: ds.ensureXml,
            resolveImageData: resolveRefToDataUrl,
            uploadImage: ({ dataUrl, name, projectId }) => upload({ dataUrl, name, projectId, folderId: activeFolder }),
            saveDiagram: (id, xml) => ds.saveDiagram(id, xml),
            deleteDiagram: (id) => ds.deleteDiagram(id),
          }, true)
          done++
        } catch { /* seguir con los demás */ }
      }
      addToast({ type: 'success', title: t('images.migrateDone', { count: done }) })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal image-gallery" style={{ width: 'min(1200px, 95vw)', height: '90vh', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{onPick ? t('images.pickTitle') : t('images.title')}</div>
            <div className="modal-sub">{onPick ? t('images.pickSubtitle') : t('images.subtitle')}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', gap: 14, minHeight: 0 }}>
          {/* Sidebar carpetas */}
          <div className="ig-sidebar">
            <button
              className={`ig-folder ${activeFolder === null ? 'active' : ''}`}
              onClick={() => setActiveFolder(null)}
            >
              <ImageIcon size={14} /> {t('images.allImages')}
            </button>
            {scopeFolders.map((f) => (
              <div key={f.id} className={`ig-folder ${activeFolder === f.id ? 'active' : ''}`}>
                <button className="ig-folder-btn" onClick={() => setActiveFolder(f.id)}>
                  <Folder size={14} /> {f.name}
                </button>
                <button
                  className="icon-btn ig-folder-del"
                  title={t('common.delete')}
                  onClick={() => { void deleteFolder(f.id); if (activeFolder === f.id) setActiveFolder(null) }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button className="btn-ghost ig-newfolder" onClick={handleNewFolder}>
              <FolderPlus size={14} /> {t('images.newFolder')}
            </button>
            {!onPick && (
              <button className="btn-ghost ig-newfolder" onClick={handleMigrate} disabled={migrating} title={t('images.migrateSubtitle')}>
                <Wand2 size={14} /> {migrating ? t('images.uploading') : t('images.migrateAction')}
              </button>
            )}
          </div>

          {/* Panel principal */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="home-search" style={{ flex: 1 }}>
                <Search size={14} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('images.search')} />
              </div>
              <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload size={14} style={{ marginRight: 6 }} />
                {uploading ? t('images.uploading') : t('images.upload')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => void handleFiles(e.target.files)}
              />
            </div>

            <div className="ig-grid" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files) }}>
              {scopeImages.map((img) => (
                <div key={img.id} className={`ig-card ${onPick ? 'pickable' : ''}`} onClick={() => onPick?.(img)}>
                  <div className="ig-card-thumb">
                    <ImageThumb imageId={img.id} alt={img.name} />
                    {!onPick && (
                      <div className="ig-card-actions">
                        <button className="icon-btn" title={t('images.rename')} onClick={(e) => { e.stopPropagation(); void handleRename(img) }}>
                          <Pencil size={13} />
                        </button>
                        {scopeFolders.length > 0 && (
                          <select
                            className="ig-move"
                            value={img.folderId ?? ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => void move(img.id, e.target.value || null)}
                            title={t('images.moveToFolder')}
                          >
                            <option value="">{t('images.noFolder')}</option>
                            {scopeFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        )}
                        <button className="icon-btn" title={t('common.delete')} onClick={(e) => { e.stopPropagation(); setConfirmDelete(img) }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="ig-card-name" title={img.name}>{img.name}</div>
                </div>
              ))}
              {scopeImages.length === 0 && (
                <div className="ig-empty">
                  <ImageIcon size={32} />
                  <p>{t('images.empty')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ width: 'min(400px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">{t('images.deleteTitle')}</div></div>
            <div className="modal-body"><p style={{ margin: 0, fontSize: 13 }}>{t('images.deleteConfirm', { name: confirmDelete.name })}</p></div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" style={{ background: 'var(--error)' }} onClick={async () => {
                const target = confirmDelete
                setConfirmDelete(null)
                try {
                  await remove(target.id)
                } catch (e) {
                  addToast({ type: 'error', title: t('images.deleteError'), message: e instanceof Error ? e.message : undefined })
                }
              }}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
