/**
 * ThemeColors.ts
 * Helpers para leer las variables CSS del tema activo
 * y retornar los colores correctos para cada tipo de elemento BPMN.
 */

/** Lee el valor de una variable CSS del documento raíz */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

// ──────────────────────────────────────────────────────────────
// Paleta de colores por tipo de elemento, reactiva al tema
// ──────────────────────────────────────────────────────────────

export interface ElementColors {
  fill: string
  stroke: string
  labelColor: string
}

export function taskColors(): ElementColors {
  return {
    fill:       cssVar('--task-fill'),
    stroke:     cssVar('--task-stroke'),
    labelColor: cssVar('--task-text'),
  }
}

export function startEventColors(): ElementColors {
  return {
    fill:       cssVar('--start-fill'),
    stroke:     cssVar('--start-stroke'),
    labelColor: cssVar('--text'),
  }
}

export function endEventColors(): ElementColors {
  return {
    fill:       cssVar('--end-fill'),
    stroke:     cssVar('--end-stroke'),
    labelColor: cssVar('--text'),
  }
}

export function intermediateEventColors(): ElementColors {
  return {
    fill:       cssVar('--int-fill'),
    stroke:     cssVar('--int-stroke'),
    labelColor: cssVar('--text'),
  }
}

export function gatewayColors(): ElementColors {
  return {
    fill:       cssVar('--gateway-fill'),
    stroke:     cssVar('--gateway-stroke'),
    labelColor: cssVar('--text'),
  }
}

export function poolColors(): ElementColors {
  return {
    fill:       cssVar('--pool-fill'),
    stroke:     cssVar('--pool-stroke'),
    labelColor: cssVar('--text-2'),
  }
}

export function laneColors(): ElementColors {
  return {
    fill:       cssVar('--lane-fill'),
    stroke:     cssVar('--pool-stroke'),
    labelColor: cssVar('--text-2'),
  }
}

export function connectionColors(): { stroke: string; labelColor: string } {
  return {
    stroke:     cssVar('--text-2'),
    labelColor: cssVar('--text'),
  }
}

export function defaultColors(): ElementColors {
  return {
    fill:       cssVar('--bg'),
    stroke:     cssVar('--text-2'),
    labelColor: cssVar('--text'),
  }
}
