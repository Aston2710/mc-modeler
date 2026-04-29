// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

/**
 * Permite que los Carriles (Lanes) particionen Pools en lugar de pegarse como etiquetas.
 */
function LaneDropBehavior(eventBus: AnyObj, modeling: AnyObj, bpmnFactory: AnyObj, elementFactory: AnyObj) {
  // Interceptamos el evento EXACTO cuando el usuario suelta el clic izquierdo
  eventBus.on('create.end', 1500, function(event: AnyObj) {
    const context = event.context
    const shape = context.shape
    const target = context.target

    if (!shape || shape.type !== 'bpmn:Lane') return

    // CASO: Soltado sobre un Pool (Participant) o sobre otro Carril (Lane)
    // El cursor sólo estará en verde si estamos sobre estos elementos (reglas nativas)
    if (target.type === 'bpmn:Participant' || target.type === 'bpmn:Lane') {
      // Navegamos hacia arriba para encontrar el contenedor padre absoluto (El Pool)
      let participant = target
      while (participant && participant.type !== 'bpmn:Participant') {
        participant = participant.parent
      }

      if (participant) {
        // Buscamos si el Pool ya tiene carriles estructurales
        const lanes = (participant.children || []).filter((c: AnyObj) => c.type === 'bpmn:Lane')
        
        if (lanes.length === 0) {
          // Si es un Pool sólido, lo partimos a la mitad perfectamente
          modeling.splitLane(participant, 2)
        } else {
          // Si ya tiene carriles, añadimos uno nuevo en orden
          if (target.type === 'bpmn:Lane') {
            // Se soltó encima de un carril específico
            // Evaluamos la posición del ratón para decidir si va arriba o abajo del carril actual
            const bounds = target
            const isTopHalf = event.y < (bounds.y + bounds.height / 2)
            modeling.addLane(target, isTopHalf ? 'top' : 'bottom')
          } else {
            // Se soltó en la cabecera del pool
            const lastLane = lanes[lanes.length - 1]
            modeling.addLane(lastLane, 'bottom')
          }
        }
      }
      // Cancelamos la etiqueta flotante original
      return false 
    }
  })
}

LaneDropBehavior.$inject = ['eventBus', 'modeling', 'bpmnFactory', 'elementFactory']

export default {
  __init__: ['laneDropBehavior'],
  laneDropBehavior: ['type', LaneDropBehavior]
}
