// bpmn-js modeler configuration
import ThemeAwareRendererModule from './rendering/ThemeAwareRendererModule'
import CanvasLassoModule from './canvas/CanvasLassoModule'
import ScrollPanModule from './canvas/ScrollPanModule'
import PoolInteriorLassoModule from './canvas/PoolInteriorLassoModule'
import CustomResizeModule from './elements/CustomResizeModule'
import CustomSelectionModule from './canvas/CustomSelectionModule'
import CustomElementSizesModule from './elements/CustomElementSizesModule'
import TranslateModule from './i18n/TranslateModule'
import CanvasPageModule from './canvas/CanvasPageModule'
import BoundaryConstraintModule from './elements/BoundaryConstraintModule'
import GroupMoveModule from './elements/GroupMoveModule'
import LassoIntersectionModule from './canvas/LassoIntersectionModule'
import LaneDropModule from './elements/LaneDropModule'
import ImageContextPadModule from './elements/ImageContextPadModule'
import BizagiLayouter from './connections/BizagiLayouter'
import BizagiConnectionDocking from './connections/BizagiConnectionDocking'
import BizagiSegmentHandles from './connections/BizagiSegmentHandles'
import ConnectionEndpointCirclesModule from './connections/ConnectionEndpointCirclesModule'

// NOTA: BizagiDragRouter eliminado — bpmn-js llama al layouter registrado
// automáticamente durante el drag a través del canal oficial 'layouter'.
// No se necesita ningún módulo interceptor adicional.

export const MODELER_CONFIG = {
  additionalModules: [
    TranslateModule,
    ThemeAwareRendererModule,
    CanvasLassoModule,
    ScrollPanModule,
    PoolInteriorLassoModule,
    CustomResizeModule,
    CustomSelectionModule,
    CustomElementSizesModule,
    CanvasPageModule,
    BoundaryConstraintModule,
    GroupMoveModule,
    LassoIntersectionModule,
    LaneDropModule,
    ImageContextPadModule,
    ConnectionEndpointCirclesModule,
    BizagiLayouter,
    BizagiConnectionDocking,
    BizagiSegmentHandles,
  ],
  keyboardMoveSelection: { moveSpeed: 5, moveSpeedAccelerated: 15 },
}
