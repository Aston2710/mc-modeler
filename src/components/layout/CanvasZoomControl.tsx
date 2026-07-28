import { useTranslation } from 'react-i18next'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'

interface CanvasZoomControlProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToScreen: () => void
}

/**
 * Control de zoom flotante (abajo-derecha), overlay sobre el área del canvas.
 * NO toca el canvas: dispara los mismos handlers de zoom que ya existían en la
 * barra superior. Se monta como hermano de <BpmnCanvas> en su contenedor relativo.
 */
export function CanvasZoomControl({ onZoomIn, onZoomOut, onFitToScreen }: CanvasZoomControlProps) {
  const { t } = useTranslation()
  const zoom = useUIStore((s) => s.zoom)

  return (
    <div className="canvas-zoom">
      <button onClick={onZoomOut} title={t('toolbar.zoomOut')} aria-label={t('toolbar.zoomOut')}>
        <ZoomOut size={15} />
      </button>
      <span className="cz-val">{Math.round(zoom * 100)}%</span>
      <button onClick={onZoomIn} title={t('toolbar.zoomIn')} aria-label={t('toolbar.zoomIn')}>
        <ZoomIn size={15} />
      </button>
      <button onClick={onFitToScreen} title={t('toolbar.fitToScreen')} aria-label={t('toolbar.fitToScreen')}>
        <Maximize2 size={14} />
      </button>
    </div>
  )
}
