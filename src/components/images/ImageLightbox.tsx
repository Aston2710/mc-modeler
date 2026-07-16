import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, ChevronLeft, ChevronRight, Trash2, FolderOpen, ImageIcon } from 'lucide-react'
import { useImageStore } from '@/store/imageStore'

interface ImageLightboxProps {
  imageIds: string[]
  canEdit: boolean
  onClose: () => void
  onUnlink?: (imageId: string) => void
  onOpenGallery?: () => void
}

export function ImageLightbox({ imageIds, canEdit, onClose, onUnlink, onOpenGallery }: ImageLightboxProps) {
  const { t } = useTranslation()
  const getById = useImageStore((s) => s.getById)
  const resolve = useImageStore((s) => s.resolve)
  const [idx, setIdx] = useState(0)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const currentId = imageIds[idx]
  const image = currentId ? getById(currentId) : undefined

  useEffect(() => {
    if (!currentId) return
    setLoading(true)
    let alive = true
    void resolve(currentId).then((data) => { if (alive) { setSrc(data); setLoading(false) } })
    return () => { alive = false }
  }, [currentId, resolve])

  const prev = useCallback(() => setIdx((i) => (i - 1 + imageIds.length) % imageIds.length), [imageIds.length])
  const next = useCallback(() => setIdx((i) => (i + 1) % imageIds.length), [imageIds.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && imageIds.length > 1) prev()
      else if (e.key === 'ArrowRight' && imageIds.length > 1) next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, prev, next, imageIds.length])

  if (imageIds.length === 0) return null

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-nav lightbox-close" onClick={onClose}><X size={20} /></button>

      {imageIds.length > 1 && (
        <>
          <button className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); prev() }}><ChevronLeft size={22} /></button>
          <button className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); next() }}><ChevronRight size={22} /></button>
        </>
      )}

      {loading || !src ? (
        <div style={{ color: '#fff', display: 'grid', placeItems: 'center', gap: 8 }}>
          <ImageIcon size={40} opacity={0.5} />
        </div>
      ) : (
        <img className="lightbox-img" src={src} alt={image?.name ?? ''} onClick={(e) => e.stopPropagation()} />
      )}

      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-title">
          {image?.name ?? ''}{imageIds.length > 1 ? `  (${idx + 1}/${imageIds.length})` : ''}
        </span>
        {onOpenGallery && (
          <button className="lightbox-btn" onClick={onOpenGallery}>
            <FolderOpen size={14} /> {t('images.openInGallery')}
          </button>
        )}
        {canEdit && onUnlink && currentId && (
          <button className="lightbox-btn" onClick={() => { onUnlink(currentId); if (imageIds.length <= 1) onClose(); else setIdx(0) }}>
            <Trash2 size={14} /> {t('images.unlink')}
          </button>
        )}
      </div>
    </div>
  )
}
