// bpmn-js modeler configuration
import ThemeAwareRendererModule from './modules/ThemeAwareRendererModule'
import CanvasLassoModule from './modules/CanvasLassoModule'
import ScrollPanModule from './modules/ScrollPanModule'
import PoolInteriorLassoModule from './modules/PoolInteriorLassoModule'
import CustomResizeModule from './modules/CustomResizeModule'
import CustomSelectionModule from './modules/CustomSelectionModule'
import CustomElementSizesModule from './modules/CustomElementSizesModule'
import TranslateModule from './modules/TranslateModule'
import CanvasPageModule from './modules/CanvasPageModule'
import BoundaryConstraintModule from './modules/BoundaryConstraintModule'
import GroupMoveModule from './modules/GroupMoveModule'
import LassoIntersectionModule from './modules/LassoIntersectionModule'

export const MODELER_CONFIG = {
  additionalModules: [TranslateModule, ThemeAwareRendererModule, CanvasLassoModule, ScrollPanModule, PoolInteriorLassoModule, CustomResizeModule, CustomSelectionModule, CustomElementSizesModule, CanvasPageModule, BoundaryConstraintModule, GroupMoveModule, LassoIntersectionModule],
  // Bind keyboard to document so Delete/Backspace work regardless of canvas focus.
  // diagram-js KeyboardModule already ignores events when target is input/textarea.
  keyboard: { bindTo: document },
  // Arrow keys: 10px per press; Shift+arrow: 50px (big jump like most canvas tools)
  keyboardMoveSelection: { moveSpeed: 5, moveSpeedAccelerated: 15 },
}
