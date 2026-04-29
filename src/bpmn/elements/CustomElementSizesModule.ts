/**
 * CustomElementSizesModule.ts
 *
 * Parchea elementFactory.getDefaultSize() para usar los tamaños definidos
 * en src/bpmn/ElementSizes.ts en lugar de los hardcodeados en bpmn-js.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

import { ELEMENT_SIZES } from '../ElementSizes'

function CustomElementSizes(elementFactory: AnyObj) {
  const original = elementFactory.getDefaultSize.bind(elementFactory)

  elementFactory.getDefaultSize = function (element: AnyObj, di: AnyObj) {
    const bo = element?.businessObject || element
    const is = (type: string) => !!bo?.$instanceOf?.(type)

    if (is('bpmn:SubProcess')) {
      const expanded = di?.isExpanded !== false
      return expanded ? ELEMENT_SIZES.subProcessExpanded : ELEMENT_SIZES.subProcessCollapsed
    }

    if (is('bpmn:Task'))    return ELEMENT_SIZES.task
    if (is('bpmn:Gateway')) return ELEMENT_SIZES.gateway
    if (is('bpmn:Event'))   return ELEMENT_SIZES.event

    if (is('bpmn:Participant')) {
      const horizontal = di?.isHorizontal === undefined || di?.isHorizontal === true
      // bpmn-js sets processRef on expanded pools; collapsed pools have no processRef
      const expanded = !!bo?.processRef
      if (expanded) {
        return horizontal
          ? ELEMENT_SIZES.participantExpanded
          : ELEMENT_SIZES.participantExpandedVertical
      }
      return horizontal
        ? ELEMENT_SIZES.participantCollapsed
        : ELEMENT_SIZES.participantCollapsedVertical
    }

    if (is('bpmn:Lane'))                return ELEMENT_SIZES.lane
    if (is('bpmn:DataObjectReference')) return ELEMENT_SIZES.dataObject
    if (is('bpmn:DataStoreReference'))  return ELEMENT_SIZES.dataStore
    if (is('bpmn:TextAnnotation')) {
      if (bo?.text?.startsWith('[IMAGE:')) return { width: 150, height: 100 }
      return ELEMENT_SIZES.textAnnotation
    }
    if (is('bpmn:Group'))               return ELEMENT_SIZES.group

    return original(element, di)
  }
}

CustomElementSizes.$inject = ['elementFactory']

const CustomElementSizesModule = {
  __init__: ['customElementSizes'],
  customElementSizes: ['type', CustomElementSizes],
}

export default CustomElementSizesModule
