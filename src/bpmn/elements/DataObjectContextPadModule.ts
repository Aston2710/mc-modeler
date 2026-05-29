// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

const FLOW_NODE_TYPES = new Set([
  'bpmn:Task', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:ManualTask',
  'bpmn:BusinessRuleTask', 'bpmn:ScriptTask', 'bpmn:SendTask', 'bpmn:ReceiveTask',
  'bpmn:SubProcess', 'bpmn:CallActivity',
  'bpmn:StartEvent', 'bpmn:EndEvent',
  'bpmn:IntermediateCatchEvent', 'bpmn:IntermediateThrowEvent', 'bpmn:BoundaryEvent',
  'bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:ParallelGateway',
  'bpmn:EventBasedGateway', 'bpmn:ComplexGateway',
])

// File icon + right arrow (data produced by element → output)
const OUTPUT_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' stroke-width='1.5' stroke='%23555' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 2h7l4 4v13H4z'/%3E%3Cpath d='M11 2v4h4'/%3E%3Cline x1='6' y1='10' x2='10' y2='10'/%3E%3Cline x1='6' y1='13' x2='10' y2='13'/%3E%3Cpath d='M14 11h5m-2-2 2 2-2 2'/%3E%3C/svg%3E"

// File icon + left arrow (data consumed by element → input)
const INPUT_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' stroke-width='1.5' stroke='%23555' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 2h7l4 4v13H4z'/%3E%3Cpath d='M11 2v4h4'/%3E%3Cline x1='6' y1='10' x2='10' y2='10'/%3E%3Cline x1='6' y1='13' x2='10' y2='13'/%3E%3Cpath d='M19 11h-5m2-2-2 2 2 2'/%3E%3C/svg%3E"

// DataObjectReference default size in bpmn-js
const DATA_OBJ_HEIGHT = 50

function DataObjectContextPadProvider(
  this: AnyObj,
  contextPad: AnyObj,
  modeling: AnyObj,
  elementFactory: AnyObj,
  bpmnFactory: AnyObj,
  autoPlace: AnyObj
) {
  this._modeling = modeling
  this._elementFactory = elementFactory
  this._bpmnFactory = bpmnFactory
  this._autoPlace = autoPlace

  contextPad.registerProvider(this)
}

DataObjectContextPadProvider.$inject = [
  'contextPad', 'modeling', 'elementFactory', 'bpmnFactory', 'autoPlace',
]

DataObjectContextPadProvider.prototype.getContextPadEntries = function(element: AnyObj) {
  const {
    _elementFactory: elementFactory,
    _bpmnFactory: bpmnFactory,
    _autoPlace: autoPlace,
    _modeling: modeling,
  } = this

  if (Array.isArray(element?.waypoints)) return {}
  if (!FLOW_NODE_TYPES.has(element.type)) return {}

  function createDataObjectShape() {
    const dataObject = bpmnFactory.create('bpmn:DataObject', {})
    const bo = bpmnFactory.create('bpmn:DataObjectReference', {
      dataObjectRef: dataObject,
      name: '',
    })
    return elementFactory.createShape({
      type: 'bpmn:DataObjectReference',
      businessObject: bo,
    })
  }

  return {
    'dataObject.output': {
      group: 'connect',
      title: 'Agregar objeto de datos (salida)',
      imageUrl: OUTPUT_ICON,
      action: {
        click: function(_event: AnyObj, el: AnyObj) {
          autoPlace.append(el, createDataObjectShape())
        },
      },
    },
    'dataObject.input': {
      group: 'connect',
      title: 'Agregar objeto de datos (entrada)',
      imageUrl: INPUT_ICON,
      action: {
        click: function(_event: AnyObj, el: AnyObj) {
          const shape = createDataObjectShape()
          // Place centered above the source element (gap = 40px)
          const position = {
            x: el.x + el.width / 2,
            y: el.y - DATA_OBJ_HEIGHT / 2 - 40,
          }
          modeling.createShape(shape, position, el.parent)
          // DataObjectRef → Task = bpmn:DataInputAssociation (bpmn-js rules)
          modeling.connect(shape, el)
        },
      },
    },
  }
}

export default {
  __init__: ['dataObjectContextPadProvider'],
  dataObjectContextPadProvider: ['type', DataObjectContextPadProvider],
}
