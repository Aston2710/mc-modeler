import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { useImageStore } from '@/store/imageStore'

interface ImageThumbProps {
  imageId: string
  alt?: string
  className?: string
  /**
   * `cover` recorta para llenar; `contain` enseña la imagen entera.
   *
   * Para una foto de documento manda `cover` —se busca el dato identificador,
   * no la hoja completa—, pero un **logo hay que verlo entero**: recortado no se
   * puede elegir. De ahí que sea una decisión de quien lo usa.
   */
  fit?: 'cover' | 'contain'
}

/** Miniatura que resuelve los bytes de la imagen bajo demanda (con caché en el store). */
export function ImageThumb({ imageId, alt, className, fit = 'cover' }: ImageThumbProps) {
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
  // object-position: top — en documentos el dato identificador vive arriba
  // (título, "Pedido", "Observaciones"); recortar por el centro los ocultaba.
  // Sin recorte no aplica: la imagen ya se ve entera, y anclarla arriba la
  // descentraría dentro de su hueco.
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className}
      style={{
        objectFit: fit,
        objectPosition: fit === 'cover' ? 'top' : 'center',
        width: '100%',
        height: '100%',
      }}
    />
  )
}
