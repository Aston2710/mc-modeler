// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function ImageContextPadProvider(this: AnyObj, contextPad: AnyObj, modeling: AnyObj) {
  this._contextPad = contextPad
  this._modeling = modeling

  contextPad.registerProvider(this)
}

ImageContextPadProvider.$inject = ['contextPad', 'modeling']

ImageContextPadProvider.prototype.getContextPadEntries = function(element: AnyObj) {
  const modeling = this._modeling

  if (element.type === 'bpmn:TextAnnotation' && element.businessObject.text?.startsWith('[IMAGE:')) {
    return {
      'image.upload': {
        group: 'edit',
        title: 'Cargar imagen desde tu PC',
        imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' stroke-width='2' stroke='%23333' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12'/%3E%3C/svg%3E",
        action: {
          click: function() {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = (e: AnyObj) => {
              const file = e.target.files[0]
              if (!file) return

              const reader = new FileReader()
              reader.onload = (re) => {
                const base64 = re.target?.result as string
                modeling.updateProperties(element, {
                  text: '[IMAGE:' + base64 + ']'
                })
              }
              reader.readAsDataURL(file)
            }
            input.click()
          }
        }
      },
      'image.url': {
        group: 'edit',
        title: 'Importar URL o enlace de Google Drive',
        imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' stroke-width='2' stroke='%23333' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/%3E%3C/svg%3E",
        action: {
          click: function() {
            let url = window.prompt("Pega el enlace directo de la imagen o el enlace para compartir de Google Drive:")
            if (!url) return
            
            // Auto-convertir enlaces del visor de Drive a enlaces de descarga directa para que la imagen renderice
            const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
            if (driveMatch && driveMatch[1]) {
              url = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`
            }

            modeling.updateProperties(element, {
              text: '[IMAGE:' + url + ']'
            })
          }
        }
      }
    }
  }

  return {}
}

export default {
  __init__: ['imageContextPadProvider'],
  imageContextPadProvider: ['type', ImageContextPadProvider]
}
