import { useRef, useState } from 'react'
import { X, Upload } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useDiagramStore } from '@/store/diagramStore'
import { uploadImageDataUrl } from '@/utils/imageStorage'

export function ImageUploadModal() {
  const { imageUploadContext, closeModal, setImageUploadContext } = useUIStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  if (!imageUploadContext) return null

  const handleClose = () => {
    setImageUploadContext(null)
    closeModal()
  }



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 2048
        const MAX_HEIGHT = 2048
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        
        // Comprimir como WebP a 90% en alta resolución (hasta 2K)
        const dataUrl = canvas.toDataURL('image/webp', 0.90)
        // Subir a Storage (ADR Etapa 4): el XML guarda una referencia ligera.
        // Fallback interno: si falla, devuelve el dataURL y queda embebida.
        setUploading(true)
        const diagramId = useDiagramStore.getState().activeTabId ?? ''
        void uploadImageDataUrl(diagramId, dataUrl).then((url) => {
          imageUploadContext.onConfirm(url)
          setUploading(false)
          handleClose()
        })
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 450 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Insertar Imagen</div>
          </div>
          <button className="icon-btn" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              className="btn-primary"
              disabled={uploading}
              onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}
            >
              <Upload size={16} style={{ marginRight: 8 }} />
              {uploading ? 'Subiendo…' : 'Seleccionar o Arrastrar archivo aquí'}
            </button>
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
              La imagen se guardará en alta calidad (WebP).
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
