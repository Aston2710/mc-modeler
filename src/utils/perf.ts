/**
 * Instrumentación de rendimiento (Fase 0 del plan de optimización).
 *
 * Mide los caminos calientes de la app: apertura de diagrama, cambio de
 * pestaña, importXML, guardado (export + thumbnail + persistencia) y conexión
 * de colaboración. Los resultados se acumulan en un buffer en memoria y se
 * exponen en `window.__flujoPerf` para inspección manual o automatizada.
 *
 * Solo activo en dev (`import.meta.env.DEV`) o si localStorage tiene
 * `flujo:perf = "1"`. En producción sin el flag: coste cero (no-op).
 *
 * Ver fix_doc/tab-switching-instancia-viva.md (Fase 0) y kpi/.
 */

export interface PerfEntry {
  /** Nombre del span, p. ej. 'tab:switch', 'bpmn:importXML' */
  name: string
  /** Duración en ms (performance.now, sub-ms) */
  dur: number
  /** Timestamp de inicio relativo al origen de la página */
  start: number
  /** Metadatos: id de diagrama, bytes de XML, etc. */
  meta?: Record<string, string | number | boolean>
}

interface PerfStats {
  name: string
  count: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
}

const enabled: boolean =
  import.meta.env.DEV ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('flujo:perf') === '1')

const entries: PerfEntry[] = []

/**
 * Inicia un span; la función devuelta lo cierra y registra la duración.
 * `end()` acepta metadatos adicionales que se fusionan con los de inicio.
 */
export function perfStart(
  name: string,
  meta?: Record<string, string | number | boolean>
): (extraMeta?: Record<string, string | number | boolean>) => number {
  if (!enabled) return () => 0
  const start = performance.now()
  return (extraMeta) => {
    const dur = performance.now() - start
    entries.push({ name, dur, start, meta: meta || extraMeta ? { ...meta, ...extraMeta } : undefined })
    return dur
  }
}

/** Mide una función async completa como un span. */
export async function perfSpan<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, string | number | boolean>
): Promise<T> {
  const end = perfStart(name, meta)
  try {
    return await fn()
  } finally {
    end()
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

function summary(): PerfStats[] {
  const byName = new Map<string, number[]>()
  for (const e of entries) {
    const arr = byName.get(e.name) ?? []
    arr.push(e.dur)
    byName.set(e.name, arr)
  }
  const stats: PerfStats[] = []
  for (const [name, durs] of byName) {
    const sorted = [...durs].sort((a, b) => a - b)
    stats.push({
      name,
      count: sorted.length,
      min: round(sorted[0]),
      max: round(sorted[sorted.length - 1]),
      avg: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p50: round(percentile(sorted, 50)),
      p95: round(percentile(sorted, 95)),
    })
  }
  return stats.sort((a, b) => a.name.localeCompare(b.name))
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

declare global {
  interface Window {
    __flujoPerf?: {
      entries: PerfEntry[]
      summary: () => PerfStats[]
      table: () => void
      clear: () => void
    }
  }
}

if (enabled && typeof window !== 'undefined') {
  window.__flujoPerf = {
    entries,
    summary,
    table: () => console.table(summary()),
    clear: () => { entries.length = 0 },
  }
}
