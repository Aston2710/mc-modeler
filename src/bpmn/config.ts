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
import ImageLinkContextPadModule from './elements/ImageLinkContextPadModule'
import ImageBadgeModule from './elements/ImageBadgeModule'
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
import ConnectionEndpointRulesModule from './elements/ConnectionEndpointRulesModule'
import StickyLaneLabelsModule from './canvas/StickyLaneLabelsModule'
import DocumentFrameModule from './canvas/DocumentFrameModule'
import CommentContextPadModule from './elements/CommentContextPadModule'
import ReadOnlyModule from './elements/ReadOnlyModule'
import flujoModdle from './moddle/flujo.json'

// Copiar/pegar por el portapapeles del sistema.
//
// ATENCIÓN — aquí sigue la DEPENDENCIA ORIGINAL a propósito, no nuestro módulo.
//
// `elements/NativeCopyPasteModule.ts` ya existe, está probado y corrige los tres
// agujeros de esta dependencia (descarta tipos desconocidos en silencio, deja
// pasar objetos sin descriptor —que rompen el guardado del diagrama entero— y
// pierde `$attrs`, y con él el vínculo de imagen de los objetos de datos).
//
// Pero **su cableado no está verificado en un navegador real**: jsdom no tiene
// `navigator.clipboard`, así que las pruebas cubren la lógica de ida y vuelta y
// NO el enganche al portapapeles ni las prioridades de evento. Cambiar esta
// línea afecta a cada copiar/pegar de todos los usuarios, así que la capa C se
// despliega dormida (decisión del usuario, 2026-09-03).
//
// Mientras esté así, un objeto sin descriptor todavía puede colarse al pegar —
// pero ya NO cuesta el diagrama: la capa A lo repara al guardar. Ver EXP-022 y
// PLAN-035, que lleva el paso de activación pendiente.
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
    ImageLinkContextPadModule,
    ImageBadgeModule,
    DataObjectContextPadModule,
    ConnectionEndpointCirclesModule,
    ConnectionContextPadModule,
    SubProcessInterceptorModule,
    PhaseModule,
    PhaseLabelEditingModule,
    GroupConnectionRulesModule,
    ConnectionEndpointRulesModule,
    StickyLaneLabelsModule,
    DocumentFrameModule,
    CommentContextPadModule,
    ReadOnlyModule,
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
