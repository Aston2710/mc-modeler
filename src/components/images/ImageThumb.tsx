import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { useImageStore } from '@/store/imageStore'

interface ImageThumbProps {
  imageId: string
  alt?: string
  className?: string
}

/** Miniatura que resuelve los bytes de la imagen bajo demanda (con caché en el store). */
export function ImageThumb({ imageId, alt, className }: ImageThumbProps) {
  const cached = useImageStore((s) => s.resolved[imageId])
  const resolve = useImageStore((s) => s.resolve)
  const [src, setSrc] = useState<string | null>(cached ?? null)

  useEffect(() => {
    if (cached) { setSrc(cached); return }
    let alive = true
    void resolve(imageId).then((data) => { if (alive) setSrc(data) })
    return () => { alive = false }
  }, [imageId, cached, resolve])

  if (!src) {
    return (
      <div className={className} style={{ display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
        <ImageIcon size={20} />
      </div>
    )
  }
  return <img src={src} alt={alt ?? ''} className={className} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
}
