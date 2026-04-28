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

export const MODELER_CONFIG = {
  additionalModules: [TranslateModule, ThemeAwareRendererModule, CanvasLassoModule, ScrollPanModule, PoolInteriorLassoModule, CustomResizeModule, CustomSelectionModule, CustomElementSizesModule, CanvasPageModule, BoundaryConstraintModule],
  // Bind keyboard to document so Delete/Backspace work regardless of canvas focus.
  // diagram-js KeyboardModule already ignores events when target is input/textarea.
  keyboard: { bindTo: document },
}
