import { describe, it, expect } from 'vitest'
import {
  isOrthogonal,
  firstDiagonalIndex,
  collapseColinear,
  repairChainFromStart,
  repairChainFromEnd,
  slideDock,
  gatewayVertexDock,
  isOnRectEdge,
  pointInRectInterior,
  segmentClipsRect,
  routeInvades,
  isExactOrthogonal,
  snapOrthogonal,
  type Point,
} from './orthogonal'

const L: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 80 },
]

describe('isOrthogonal / firstDiagonalIndex', () => {
  it('acepta rutas H/V', () => {
    expect(isOrthogonal(L)).toBe(true)
  })
  it('detecta diagonales', () => {
    const diag = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 40 }]
    expect(isOrthogonal(diag)).toBe(false)
    expect(firstDiagonalIndex(diag)).toBe(1)
  })
  it('tolera desvíos sub-píxel', () => {
    expect(isOrthogonal([{ x: 0, y: 0 }, { x: 100, y: 0.5 }])).toBe(true)
  })
  it('rutas vacías o de un punto no son diagonales', () => {
    expect(isOrthogonal([])).toBe(true)
    expect(isOrthogonal(null)).toBe(true)
    expect(firstDiagonalIndex([{ x: 1, y: 1 }])).toBe(-1)
  })
})

describe('collapseColinear', () => {
  it('elimina puntos intermedios colineales', () => {
    const wps = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }]
    expect(collapseColinear(wps)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }])
  })
  it('elimina duplicados', () => {
    const wps = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }]
    expect(collapseColinear(wps)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }])
  })
  it('no muta la entrada y conserva extremos', () => {
    const wps = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]
    const out = collapseColinear(wps)
    expect(wps).toHaveLength(3)
    expect(out[0]).toEqual({ x: 0, y: 0 })
    expect(out[out.length - 1]).toEqual({ x: 100, y: 0 })
  })
})

describe('repairChainFromStart', () => {
  it('desliza el vecino cuando su segmento es perpendicular al eje de salida', () => {
    // salida right (horizontal); p1–p2 vertical → p1 baja a la altura del dock
    const out = repairChainFromStart(L, { x: 0, y: 20 }, 'right')
    expect(out[0]).toEqual({ x: 0, y: 20 })
    expect(out[1]).toEqual({ x: 100, y: 20 })
    expect(isOrthogonal(out)).toBe(true)
  })
  it('inserta bend cuando el vecino no puede deslizarse (ruta de 2 puntos)', () => {
    const straight = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const out = repairChainFromStart(straight, { x: 0, y: 30 }, 'right')
    expect(out[0]).toEqual({ x: 0, y: 30 })
    expect(out[out.length - 1]).toEqual({ x: 100, y: 0 })
    expect(isOrthogonal(out)).toBe(true)
  })
  it('cambio de eje (salida por top con ruta horizontal) inserta bend vertical', () => {
    const out = repairChainFromStart(L, { x: 40, y: -10 }, 'top')
    expect(out[0]).toEqual({ x: 40, y: -10 })
    expect(isOrthogonal(out)).toBe(true)
    // último punto intacto
    expect(out[out.length - 1]).toEqual({ x: 100, y: 80 })
  })
  it('dock ya alineado → sin cambios estructurales', () => {
    const out = repairChainFromStart(L, { x: 0, y: 0 }, 'right')
    expect(out).toEqual(L)
  })
})

describe('repairChainFromEnd', () => {
  it('re-ancla el último punto manteniendo ortogonalidad', () => {
    // llegada por left del target (horizontal); último segmento es vertical → inserta bend
    const out = repairChainFromEnd(L, { x: 120, y: 80 }, 'left')
    expect(out[out.length - 1]).toEqual({ x: 120, y: 80 })
    expect(out[0]).toEqual({ x: 0, y: 0 })
    expect(isOrthogonal(out)).toBe(true)
  })
  it('desliza el vecino cuando puede', () => {
    // llegada por top (vertical); penúltimo segmento horizontal → desliza
    const wps = [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 80 }]
    const out = repairChainFromEnd(wps, { x: 90, y: 80 }, 'top')
    expect(out[out.length - 1]).toEqual({ x: 90, y: 80 })
    expect(isOrthogonal(out)).toBe(true)
  })
})

describe('slideDock', () => {
  const task = { x: 100, y: 100, width: 100, height: 80 }
  it('conserva la posición a lo largo del borde', () => {
    const d = slideDock(task, { x: 250, y: 130 })
    expect(d.face).toBe('right')
    expect(d.x).toBe(200)
    expect(d.y).toBe(130)
  })
  it('clampa con margen en las esquinas', () => {
    const d = slideDock(task, { x: 250, y: 500 })
    expect(d.face).toBe('bottom')
    // x clampada al rango [x+margin, right-margin]
    expect(d.x).toBe(188)
    expect(d.y).toBe(180)
  })
  it('margen adaptativo en shapes pequeños (event 36px)', () => {
    const event = { x: 0, y: 0, width: 36, height: 36 }
    const d = slideDock(event, { x: -50, y: 2 })
    expect(d.face).toBe('left')
    // margen = min(12, 9, 9) = 9 → y >= 9
    expect(d.y).toBe(9)
  })
  it('punto interior elige la cara más cercana', () => {
    const d = slideDock(task, { x: 105, y: 140 })
    expect(d.face).toBe('left')
  })
})

describe('gatewayVertexDock', () => {
  const gw = { x: 0, y: 0, width: 50, height: 50 }
  it('devuelve el vértice de la cara con mayor overflow', () => {
    const d = gatewayVertexDock(gw, { x: 120, y: 25 })
    expect(d).toMatchObject({ x: 50, y: 25, face: 'right' })
  })
  it('histéresis: mantiene la cara actual si la nueva no supera el umbral', () => {
    // punto apenas 5px más allá del centro hacia abajo; cara actual right
    const d = gatewayVertexDock(gw, { x: 52, y: 60 }, 'right')
    expect(d.face).toBe('right')
  })
  it('histéresis: cambia de cara cuando el overflow domina claramente', () => {
    const d = gatewayVertexDock(gw, { x: 52, y: 120 }, 'right')
    expect(d.face).toBe('bottom')
    expect(d).toMatchObject({ x: 25, y: 50 })
  })
})

describe('isExactOrthogonal / snapOrthogonal (arrastrabilidad garantizada)', () => {
  it('isExactOrthogonal: exige enteros y 0px de desalineación', () => {
    expect(isExactOrthogonal([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }])).toBe(true)
    expect(isExactOrthogonal([{ x: 0, y: 0 }, { x: 100, y: 0.4 }])).toBe(false) // 0.4px desalineado
    expect(isExactOrthogonal([{ x: 0, y: 0.5 }, { x: 0, y: 80 }])).toBe(false)  // fracción
    expect(isExactOrthogonal([{ x: 0, y: 0 }, { x: 50, y: 40 }])).toBe(false)   // diagonal
  })

  it('snapOrthogonal: residuo sub-píxel → exacto ortogonal entero', () => {
    const wps = [{ x: 0, y: 0.3 }, { x: 100.2, y: 0.7 }, { x: 100.1, y: 80.4 }]
    const out = snapOrthogonal(wps)
    expect(isExactOrthogonal(out)).toBe(true)
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }])
  })

  it('snapOrthogonal: no reforma una ruta ya ortogonal entera', () => {
    const wps = [{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 300 }]
    expect(snapOrthogonal(wps)).toEqual(wps)
    expect(isExactOrthogonal(wps)).toBe(true)
  })

  it('snapOrthogonal: colapsa segmento degenerado (ambos ejes ≤tol)', () => {
    const wps = [{ x: 0, y: 0 }, { x: 0.4, y: 0.3 }, { x: 0, y: 80 }]
    const out = snapOrthogonal(wps)
    expect(isExactOrthogonal(out)).toBe(true)
  })

  it('snapOrthogonal: ruta larga multi-codo casi-ortogonal → todos los segmentos alineados', () => {
    const wps = [
      { x: 0, y: 0.2 }, { x: 60.1, y: 0.1 }, { x: 60.3, y: 40.4 },
      { x: 120.2, y: 40.1 }, { x: 120.1, y: 100.3 },
    ]
    const out = snapOrthogonal(wps)
    expect(isExactOrthogonal(out)).toBe(true)
  })
})

describe('invasión de shapes (pointInRectInterior / segmentClipsRect / routeInvades)', () => {
  const rect = { x: 100, y: 100, width: 100, height: 80 } // [100,200]×[100,180]

  it('pointInRectInterior: interior sí, borde no', () => {
    expect(pointInRectInterior(rect, { x: 150, y: 140 })).toBe(true)
    expect(pointInRectInterior(rect, { x: 100, y: 140 })).toBe(false) // borde izq
    expect(pointInRectInterior(rect, { x: 150, y: 180 })).toBe(false) // borde inf
    expect(pointInRectInterior(rect, { x: 250, y: 140 })).toBe(false) // fuera
  })

  it('segmentClipsRect: traversal completo', () => {
    expect(segmentClipsRect({ x: 50, y: 140 }, { x: 250, y: 140 }, rect)).toBe(true)
  })

  it('segmentClipsRect: "entra y termina dentro" (el punto ciego histórico)', () => {
    // segmento vertical que baja desde arriba y muere en el interior del shape
    expect(segmentClipsRect({ x: 150, y: 60 }, { x: 150, y: 140 }, rect)).toBe(true)
  })

  it('segmentClipsRect: segmento de dock que toca el borde NO clipea', () => {
    // llega al borde izquierdo desde fuera y termina en la arista
    expect(segmentClipsRect({ x: 50, y: 140 }, { x: 100, y: 140 }, rect)).toBe(false)
    // corre a lo largo del borde superior
    expect(segmentClipsRect({ x: 120, y: 100 }, { x: 180, y: 100 }, rect)).toBe(false)
  })

  it('routeInvades: bend dentro del target (caso screenshot) → true', () => {
    // gateway sale por abajo, baja y hace esquina DENTRO del task
    const wps = [
      { x: 150, y: 60 },   // vértice inferior del gateway (arriba del task)
      { x: 150, y: 140 },  // baja hasta DENTRO del task → esquina interior
      { x: 100, y: 140 },  // sale por la izquierda
    ]
    expect(routeInvades(wps, rect)).toBe(true)
  })

  it('routeInvades: ruta en L limpia que termina en el borde → false', () => {
    const wps = [
      { x: 50, y: 60 },
      { x: 50, y: 140 },
      { x: 100, y: 140 }, // dock en el borde izquierdo, sin entrar
    ]
    expect(routeInvades(wps, rect)).toBe(false)
  })

  it('routeInvades: ruta que solo bordea por fuera → false', () => {
    const wps = [
      { x: 200, y: 90 },  // dock borde derecho superior (fuera por arriba)
      { x: 260, y: 90 },
      { x: 260, y: 300 },
    ]
    expect(routeInvades(wps, rect)).toBe(false)
  })
})

describe('isOnRectEdge', () => {
  const r = { x: 0, y: 0, width: 100, height: 50 }
  it('detecta puntos sobre el perímetro', () => {
    expect(isOnRectEdge(r, { x: 100, y: 25 })).toBe(true)
    expect(isOnRectEdge(r, { x: 40, y: 0 })).toBe(true)
  })
  it('rechaza puntos fuera o interiores', () => {
    expect(isOnRectEdge(r, { x: 120, y: 25 })).toBe(false)
    expect(isOnRectEdge(r, { x: 50, y: 25 })).toBe(false)
  })
})
