import BizagiLayoutModule from '../../bpmn/connections/BizagiLayouter'
import { BizagiDirectionalRouter, type Point } from '../../bpmn/connections/BizagiDirectionalRouter'

/**
 * Traza flechas con el MISMO `BizagiLayouter` que usa el canvas, fuera de
 * bpmn-js.
 *
 * El layouter solo lee objetos planos con forma de diagram-js (`x`, `y`,
 * `width`, `height`, `incoming`, `outgoing`, `host`, `businessObject`) y
 * enumera obstáculos con `elementRegistry.forEach`. Se le dan esas formas
 * simuladas y se llama a `layoutConnection` tal cual: las flechas del XML
 * generado son las que dibujaría la app.
 *
 * Además, la app las vuelve a trazar al abrir (`ConnectionImportNormalizer`
 * re-rutea toda conexión que no sea manual), así que esto es sobre todo para
 * que el `.bpmn` que se exporte sin abrirlo en la app tenga buen aspecto.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

export interface FormaParaTrazar {
  id: string
  x: number
  y: number
  width: number
  height: number
  businessObject: Any
  incoming: Any[]
  outgoing: Any[]
  host?: FormaParaTrazar
}

export interface ConexionATrazar {
  bo: Any
  desde: string
  hasta: string
}

// El módulo de diagram-js exporta `layouter: ['type', BizagiLayouter]`.
const BizagiLayouter = (BizagiLayoutModule as Any).layouter[1]

function trazoDeRespaldo(a: FormaParaTrazar, b: FormaParaTrazar): Point[] {
  // Ortogonal en Z, de la cara derecha de A a la izquierda de B. Solo se usa si
  // el layouter no devuelve una ruta (no debería ocurrir).
  const p1 = { x: a.x + a.width, y: a.y + a.height / 2 }
  const p2 = { x: b.x, y: b.y + b.height / 2 }
  if (p1.y === p2.y) return [p1, p2]
  const mx = Math.round((p1.x + p2.x) / 2)
  return [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2]
}

/** Conexión que ya está en el diagrama: no se re-traza, pero ocupa caras. */
export interface ConexionExistente extends ConexionATrazar {
  waypoints: Point[]
}

export function trazarConexiones(
  formas: FormaParaTrazar[],
  conexiones: ConexionATrazar[],
  existentes: ConexionExistente[] = []
): Map<string, Point[]> {
  const porId = new Map(formas.map((f) => [f.id, f]))
  const todas: Any[] = [...formas]

  for (const e of existentes) {
    const source = porId.get(e.desde)
    const target = porId.get(e.hasta)
    if (!source || !target) continue
    const conn = { id: e.bo.id, businessObject: e.bo, source, target, waypoints: e.waypoints }
    source.outgoing.push(conn)
    target.incoming.push(conn)
    todas.push(conn)
  }

  const conns = conexiones.map((c) => {
    const source = porId.get(c.desde)!
    const target = porId.get(c.hasta)!
    const conn = { id: c.bo.id, businessObject: c.bo, source, target, waypoints: undefined as Point[] | undefined }
    source.outgoing.push(conn)
    target.incoming.push(conn)
    todas.push(conn)
    return conn
  })

  const layouter = Object.create(BizagiLayouter.prototype)
  layouter._elementRegistry = { forEach: (fn: (el: Any) => void) => todas.forEach(fn) }
  layouter._router = new BizagiDirectionalRouter()
  layouter._obstacleElements = null

  const trazos = new Map<string, Point[]>()
  for (const conn of conns) {
    let wps: Point[] | undefined
    try {
      wps = layouter.layoutConnection(conn, { source: conn.source, target: conn.target })
    } catch {
      wps = undefined
    }
    if (!wps || wps.length < 2) wps = trazoDeRespaldo(conn.source, conn.target)
    const redondeados = wps.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
    conn.waypoints = redondeados
    trazos.set(conn.id, redondeados)
  }
  return trazos
}
