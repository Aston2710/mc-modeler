import { describe, it, expect } from 'vitest'
import { GROUP_COLOR_DEFAULT, getGroupColor, setGroupColor } from './groupUtil'
import { FEATURED_COLORS, PALETTE_ROWS, PALETTE_HEXES } from './colorPalette'
import { PHASE_ID_PREFIX } from './phaseUtil'

// Elemento falso: businessObject con get/set que respalda flujo:groupColor.
function makeGroup(initial?: string, id = 'Group_1') {
  const store: Record<string, unknown> = { 'flujo:groupColor': initial }
  return {
    id,
    type: 'bpmn:Group',
    businessObject: {
      id,
      $type: 'bpmn:Group',
      get: (k: string) => store[k],
      set: (k: string, v: unknown) => { store[k] = v },
    },
    _store: store,
  }
}

// "#RRGGBB" → entero ARGB Int32 con signo. Réplica de hexToBizagiColor
// (bpmExport.ts) para verificar que la paleta sobrevive el formato de Bizagi.
function hexToBizagiColor(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return ((0xff << 24) | (r << 16) | (g << 8) | b) | 0
}

// Entero ARGB de Bizagi → "#rrggbb". Réplica de bizagiColorToHex (bpmImport.ts).
function bizagiColorToHex(v: string): string {
  const n = parseInt(v, 10)
  const argb = n < 0 ? n >>> 0 : n
  return '#' + [(argb >> 16) & 0xff, (argb >> 8) & 0xff, argb & 0xff]
    .map((x) => x.toString(16).padStart(2, '0')).join('')
}

describe('groupUtil — lectura y escritura', () => {
  it('sin color propio devuelve el valor por defecto (vacío)', () => {
    expect(getGroupColor(makeGroup())).toBe(GROUP_COLOR_DEFAULT)
  })

  it('devuelve el color persistido', () => {
    expect(getGroupColor(makeGroup('#2E86C8'))).toBe('#2E86C8')
  })

  it('escribe el color elegido', () => {
    const el = makeGroup()
    setGroupColor(el, '#C81E1E')
    expect(getGroupColor(el)).toBe('#C81E1E')
  })

  it('volver a "sin color" borra el atributo en vez de guardar cadena vacía', () => {
    const el = makeGroup('#9130C4')
    setGroupColor(el, '')
    // undefined (no '') para que NO se serialice al XML — mantiene el BPMN limpio.
    expect(el._store['flujo:groupColor']).toBeUndefined()
    expect(getGroupColor(el)).toBe(GROUP_COLOR_DEFAULT)
  })

  it('no revienta con un elemento nulo', () => {
    expect(getGroupColor(null)).toBe(GROUP_COLOR_DEFAULT)
    expect(() => setGroupColor(null, '#4CA22F')).not.toThrow()
  })

  it('acepta un businessObject plano (sin get/set), como en snapshots CRDT', () => {
    const bo: Record<string, unknown> = { $type: 'bpmn:Group' }
    setGroupColor(bo, '#A89A16')
    expect(getGroupColor(bo)).toBe('#A89A16')
  })
})

describe('colorPalette — rejilla de muestras', () => {
  it('destacados: los 5 colores de referencia de Bizagi', () => {
    expect(FEATURED_COLORS).toHaveLength(5)
  })

  it('rejilla de 6 filas x 12 columnas', () => {
    expect(PALETTE_ROWS).toHaveLength(6)
    for (const row of PALETTE_ROWS) expect(row).toHaveLength(12)
    expect(PALETTE_HEXES).toHaveLength(72)
  })

  it('todas las muestras son hex de 6 digitos', () => {
    for (const hex of [...FEATURED_COLORS, ...PALETTE_ROWS.flat()]) {
      expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('no hay muestras repetidas dentro de la rejilla', () => {
    expect(new Set(PALETTE_HEXES).size).toBe(PALETTE_HEXES.length)
  })

  it('PALETTE_HEXES esta en minusculas (se compara sin distinguir mayusculas)', () => {
    for (const hex of PALETTE_HEXES) expect(hex).toBe(hex.toLowerCase())
  })
})

describe('groupUtil — ida y vuelta con el formato de color de Bizagi', () => {
  it('cada muestra sobrevive hex → ARGB Int32 → hex', () => {
    for (const hex of [...FEATURED_COLORS, ...PALETTE_ROWS.flat()]) {
      const argb = hexToBizagiColor(hex)
      expect(Number.isSafeInteger(argb)).toBe(true)
      // Int32 con signo: es el rango que Bizagi acepta al guardar (ver
      // .syntesis/Export bpm - Int32 overflow/findings.md).
      expect(argb).toBeGreaterThanOrEqual(-2147483648)
      expect(argb).toBeLessThanOrEqual(2147483647)
      expect(bizagiColorToHex(String(argb))).toBe(hex.toLowerCase())
    }
  })

  it('todas las muestras producen enteros negativos (alfa 0xFF)', () => {
    // Con alfa opaco el bit 31 queda a 1 → Int32 negativo. Es la firma del
    // formato de Bizagi; un valor positivo indicaría alfa perdido.
    for (const hex of [...FEATURED_COLORS, ...PALETTE_ROWS.flat()]) {
      expect(hexToBizagiColor(hex)).toBeLessThan(0)
    }
  })

  it('reproduce las constantes conocidas de Bizagi', () => {
    // Gris de borde por defecto del Group en Bizagi: #666666.
    expect(hexToBizagiColor('#666666')).toBe(-10066330)
    expect(bizagiColorToHex('-10066330')).toBe('#666666')
  })
})

describe('groupUtil — convivencia con las Fases', () => {
  it('una Fase no tiene color de borde propio: su borde lo fija Bizagi', () => {
    // Las Fases son bpmn:Group con id Phase_* y usan flujo:phaseColor (relleno).
    const phase = makeGroup(undefined, `${PHASE_ID_PREFIX}1`)
    expect(getGroupColor(phase)).toBe(GROUP_COLOR_DEFAULT)
  })
})
