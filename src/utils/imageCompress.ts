/**
 * Comprime un File de imagen a un dataURL WebP, con el lado mayor limitado a
 * MAX px. Mismo criterio que el drag&drop del canvas (BpmnCanvas), centralizado
 * para que la galería y el canvas produzcan imágenes homogéneas.
 */
const MAX = 2048
const QUALITY = 0.9

export function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > height) {
          if (width > MAX) { height *= MAX / width; width = MAX }
        } else {
          if (height > MAX) { width *= MAX / height; height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('sin contexto 2d'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/webp', QUALITY))
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}
