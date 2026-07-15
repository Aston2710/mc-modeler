// bpmn-js modeler configuration
import ThemeAwareRendererModule from './rendering/ThemeAwareRendererModule'
import CanvasLassoModule from './canvas/CanvasLassoModule'
import ScrollPanModule from './canvas/ScrollPanModule'
import PoolInteriorLassoModule from './canvas/PoolInteriorLassoModule'
import CustomResizeModule from './elements/CustomResizeModule'
import ResizableLabelsModule from './elements/ResizableLabelsModule'
import CustomSelectionModule from './canvas/CustomSelectionModule'
import CustomElementSizesModule from './elements/CustomElementSizesModule'
import TranslateModule from './i18n/TranslateModule'
import CanvasPageModule from './canvas/CanvasPageModule'
import BoundaryConstraintModule from './elements/BoundaryConstraintModule'
import GroupMoveModule from './elements/GroupMoveModule'
import LassoIntersectionModule from './canvas/LassoIntersectionModule'
import LaneDropModule from './elements/LaneDropModule'
import ImageContextPadModule from './elements/ImageContextPadModule'
import DataObjectContextPadModule from './elements/DataObjectContextPadModule'
import BizagiLayouter from './connections/BizagiLayouter'
import BizagiConnectionDocking from './connections/BizagiConnectionDocking'
import BizagiSegmentHandles from './connections/BizagiSegmentHandles'
import OrthogonalityBehavior from './connections/OrthogonalityBehavior'
import ManualRouteBehavior from './connections/ManualRouteBehavior'
import ConnectionEndpointCirclesModule from './connections/ConnectionEndpointCirclesModule'
import ConnectionContextPadModule from './connections/ConnectionContextPadModule'
import SubProcessInterceptorModule from './elements/SubProcessInterceptorModule'
import PhaseModule from './elements/PhaseModule'
import PhaseLabelEditingModule from './elements/PhaseLabelEditingModule'
import GroupConnectionRulesModule from './elements/GroupConnectionRulesModule'
import StickyLaneLabelsModule from './canvas/StickyLaneLabelsModule'
import CommentContextPadModule from './elements/CommentContextPadModule'
import flujoModdle from './moddle/flujo.json'

// @ts-ignore
import NativeCopyPasteModule from 'bpmn-js-native-copy-paste'

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
    ResizableLabelsModule,
    CustomSelectionModule,
    CustomElementSizesModule,
    CanvasPageModule,
    BoundaryConstraintModule,
    GroupMoveModule,
    LassoIntersectionModule,
    LaneDropModule,
    ImageContextPadModule,
    DataObjectContextPadModule,
    ConnectionEndpointCirclesModule,
    ConnectionContextPadModule,
    SubProcessInterceptorModule,
    PhaseModule,
    PhaseLabelEditingModule,
    GroupConnectionRulesModule,
    StickyLaneLabelsModule,
    CommentContextPadModule,
    BizagiLayouter,
    BizagiConnectionDocking,
    BizagiSegmentHandles,
    OrthogonalityBehavior,
    ManualRouteBehavior,
    NativeCopyPasteModule,
  ],
  keyboardMoveSelection: { moveSpeed: 5, moveSpeedAccelerated: 15 },
  moddleExtensions: {
    flujo: flujoModdle,
  },
}
