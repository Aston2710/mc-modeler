import { hasLinkedImages } from './imageLink'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// SVG inline (currentColor): mismo motivo que CommentContextPadModule — el CSS
// del context pad resetea background-image, así que imageUrl no se ve.
const LINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"' +
  ' fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
  '<path d="M21 15l-5-5L5 21"/></svg>'

const VIEW_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"' +
  ' fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'

// Solo los FlowNode soportan flujo:linkedImages (ver moddle/flujo.json): tareas,
// eventos, compuertas, subprocesos, callActivity. Pools, lanes, grupos, objetos
// de datos y anotaciones quedan fuera (el atributo no persistiría en su bo).
const EXCLUDED_TYPES = new Set([
  'bpmn:Process',
  'bpmn:Collaboration',
  'bpmn:LaneSet',
  'bpmn:Participant',
  'bpmn:Lane',
  'bpmn:Group',
  'bpmn:DataObjectReference',
  'bpmn:DataStoreReference',
  'bpmn:TextAnnotation',
  'label',
])

function ImageLinkContextPadProvider(this: AnyObj, contextPad: AnyObj) {
  contextPad.registerProvider(this)
}
ImageLinkContextPadProvider.$inject = ['contextPad']

ImageLinkContextPadProvider.prototype.getContextPadEntries = function (element: AnyObj) {
  if (Array.isArray(element?.waypoints) || EXCLUDED_TYPES.has(element.type)) return {}
  const elementId = element.id as string

  const entries: AnyObj = {
    'image.link': {
      group: 'tools',
      html: `<div class="entry" draggable="false" title="Vincular imagen">${LINK_ICON}</div>`,
      action: {
        click() {
          document.dispatchEvent(new CustomEvent('bpmn:image:link', { detail: { elementId } }))
        },
      },
    },
  }

  // Si ya tiene imágenes, ofrecer también "ver".
  if (hasLinkedImages(element)) {
    entries['image.view'] = {
      group: 'tools',
      html: `<div class="entry" draggable="false" title="Ver imagen">${VIEW_ICON}</div>`,
      action: {
        click() {
          document.dispatchEvent(new CustomEvent('bpmn:image:view', { detail: { elementId } }))
        },
      },
    }
  }

  return entries
}

export default {
  __init__: ['imageLinkContextPadProvider'],
  imageLinkContextPadProvider: ['type', ImageLinkContextPadProvider],
}
