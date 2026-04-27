// bpmn-js modeler configuration
import ThemeAwareRendererModule from './modules/ThemeAwareRendererModule'
import CanvasLassoModule from './modules/CanvasLassoModule'
import ScrollPanModule from './modules/ScrollPanModule'
import PoolInteriorLassoModule from './modules/PoolInteriorLassoModule'
import CustomResizeModule from './modules/CustomResizeModule'

export const MODELER_CONFIG = {
  additionalModules: [ThemeAwareRendererModule, CanvasLassoModule, ScrollPanModule, PoolInteriorLassoModule, CustomResizeModule],
  // Bind keyboard to document so Delete/Backspace work regardless of canvas focus.
  // diagram-js KeyboardModule already ignores events when target is input/textarea.
  keyboard: { bindTo: document },
}
