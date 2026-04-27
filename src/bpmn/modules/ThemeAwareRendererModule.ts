/**
 * ThemeAwareRendererModule.ts
 *
 * Módulo bpmn-js que registra el ThemeAwareRenderer.
 * Se incluye en additionalModules de la configuración del Modeler.
 */
import ThemeAwareRenderer from './ThemeAwareRenderer'

const ThemeAwareRendererModule = {
  __init__: ['themeAwareRenderer'],
  themeAwareRenderer: ['type', ThemeAwareRenderer],
}

export default ThemeAwareRendererModule
