// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// Use html with inline SVG (currentColor) instead of imageUrl.
// Reason: CSS rule `.djs-context-pad .entry { background: var(--panel) !important }`
// uses the background shorthand which resets background-image to none, making
// imageUrl-based icons invisible. html+SVG inherits color from CSS var(--text-2).
const ENTRY_HTML =
  '<div class="entry comment-entry" draggable="true" title="Agregar comentario">' +
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"' +
  ' fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
  '</svg></div>'

// Only invisible structural containers — pools, lanes, phases, tasks all allowed
const EXCLUDED_TYPES = new Set([
  'bpmn:Process',
  'bpmn:Collaboration',
  'bpmn:LaneSet',
  'bpmn:TextAnnotation',
  'label',
])

const TYPE_LABELS: Record<string, string> = {
  Task: 'Tarea', UserTask: 'Tarea de usuario', ServiceTask: 'Tarea de servicio',
  ManualTask: 'Tarea manual', ScriptTask: 'Tarea de script', BusinessRuleTask: 'Regla de negocio',
  SendTask: 'Tarea de envío', ReceiveTask: 'Tarea de recepción',
  ExclusiveGateway: 'Puerta exclusiva', ParallelGateway: 'Puerta paralela',
  InclusiveGateway: 'Puerta inclusiva', EventBasedGateway: 'Puerta de eventos',
  Gateway: 'Puerta',
  StartEvent: 'Inicio', EndEvent: 'Fin',
  IntermediateThrowEvent: 'Evento intermedio', IntermediateCatchEvent: 'Evento intermedio',
  BoundaryEvent: 'Evento de límite',
  SubProcess: 'Sub-proceso', CallActivity: 'Actividad de llamada',
  Participant: 'Pool', Lane: 'Carril', Group: 'Fase',
  DataObject: 'Dato', DataObjectReference: 'Dato', DataStoreReference: 'Almacén de datos',
}

function getElementLabel(element: AnyObj): string {
  const name = element.businessObject?.name?.trim()
  if (name) return name
  const type = (element.type || '').replace('bpmn:', '')
  return TYPE_LABELS[type] || type
}

function CommentContextPadProvider(this: AnyObj, contextPad: AnyObj) {
  this._contextPad = contextPad
  contextPad.registerProvider(this)
}

CommentContextPadProvider.$inject = ['contextPad']

CommentContextPadProvider.prototype.getContextPadEntries = function (element: AnyObj) {
  // Connections and excluded types: no comment button
  if (Array.isArray(element?.waypoints) || EXCLUDED_TYPES.has(element.type)) {
    return {}
  }

  const elementId = element.id as string
  const elementLabel = getElementLabel(element)

  return {
    'comment.add': {
      group: 'tools',
      html: ENTRY_HTML,
      action: {
        click() {
          document.dispatchEvent(
            new CustomEvent('bpmn:comment:create', {
              detail: { type: 'element', elementId, elementLabel },
            })
          )
        },
      },
    },
  }
}

export default {
  __init__: ['commentContextPadProvider'],
  commentContextPadProvider: ['type', CommentContextPadProvider],
}
