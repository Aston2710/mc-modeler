/**
 * BizagiLayouter.ts
 *
 * CORRECCIONES respecto a versión anterior:
 *
 * FIX C — nearestGatewayFace: para gateways, nearestFace calcula distancia
 *   al CENTRO de cada cara rectangular (que no existe en un rombo).
 *   La función correcta calcula distancia al VÉRTICE de cada cara del diamante.
 *   Así, si el hint del ratón viene de arriba-derecha, se asigna el vértice
 *   superior o derecho correctamente según cuál está más cerca.
 *
 * FIX D — BizagiDragRouter eliminado.
 *   Interceptar shape.move y modificar conn.waypoints directamente no funciona:
 *   bpmn-js re-renderiza con sus propios waypoints después, sobreescribiendo los nuestros.
 *   La solución correcta es que el layouter (este archivo) sea invocado por
 *   bpmn-js a través del canal oficial 'layouter' service, que SÍ ocurre
 *   automáticamente cuando un shape conectado se mueve.
 *   No se necesita ningún módulo extra para el drag — bpmn-js llama a
 *   layoutConnection() del servicio 'layouter' registrado en cada movimiento.
 */

import { BizagiDirectionalRouter } from './BizagiDirectionalRouter'
import type { Point, RouterObstacle } from './BizagiDirectionalRouter'

type Face = 'top' | 'bottom' | 'left' | 'right'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shape = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Connection = any




function cx(s: Shape): number { return s.x + s.width  / 2 }
function cy(s: Shape): number { return s.y + s.height / 2 }

function isGateway(el: Shape): boolean {
  const bo = el?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

function isConnector(el: Shape): boolean { return Array.isArray(el?.waypoints) }

/**
 * Equivalente a `value is IRoutingPool || value is IRoutingGroup` en C#.
 * Pools, Lanes, SubProcesos expandidos y Groups son CONTENEDORES de routing,
 * no obstáculos. Incluirlos causa que el router trace flechas alrededor de sus
 * bordes en lugar de dentro de ellos.
 */
function isRoutingContainer(el: Shape): boolean {
  const bo = el?.businessObject
  if (!bo || typeof bo.$instanceOf !== 'function') return false
  return bo.$instanceOf('bpmn:Participant')
      || bo.$instanceOf('bpmn:Lane')
      || bo.$instanceOf('bpmn:Group')
}

function toObstacle(s: Shape): RouterObstacle {
  return { x: s.x, y: s.y, width: s.width, height: s.height }
}

// ── Cardinal face ─────────────────────────────────────────────────────────────

function faceCardinal(s: Shape, face: Face): Point {
  switch (face) {
    case 'top':    return { x: cx(s), y: s.y }
    case 'bottom': return { x: cx(s), y: s.y + s.height }
    case 'left':   return { x: s.x,           y: cy(s) }
    case 'right':  return { x: s.x + s.width, y: cy(s) }
  }
}

/** Vértice del diamante para la cara indicada */
function gatewayCardinal(gw: Shape, face: Face): Point {
  const gcx = gw.x + gw.width  / 2
  const gcy = gw.y + gw.height / 2
  switch (face) {
    case 'top':    return { x: gcx,             y: gw.y }
    case 'bottom': return { x: gcx,             y: gw.y + gw.height }
    case 'left':   return { x: gw.x,            y: gcy }
    case 'right':  return { x: gw.x + gw.width, y: gcy }
  }
}

function isHoriz(face: Face): boolean { return face === 'left' || face === 'right' }

/** Cara más cercana para shapes rectangulares — distancia al centro de cada cara */
function nearestFace(s: Shape, p: Point): Face {
  const d: [Face, number][] = [
    ['top',    Math.hypot(p.x - cx(s), p.y - s.y)],
    ['bottom', Math.hypot(p.x - cx(s), p.y - (s.y + s.height))],
    ['left',   Math.hypot(p.x - s.x,             p.y - cy(s))],
    ['right',  Math.hypot(p.x - (s.x + s.width), p.y - cy(s))],
  ]
  return d.sort((a, b) => a[1] - b[1])[0][0]
}

/**
 * FIX C: Para gateways (rombos), la cara más cercana se calcula como
 * distancia al VÉRTICE de cada cara, no al centro del lado.
 * Los 4 vértices del diamante son exactamente los puntos cardinales.
 */
function nearestGatewayFace(gw: Shape, p: Point): Face {
  const gcx = gw.x + gw.width  / 2
  const gcy = gw.y + gw.height / 2
  const vertices: [Face, Point][] = [
    ['top',    { x: gcx,              y: gw.y }],
    ['bottom', { x: gcx,              y: gw.y + gw.height }],
    ['left',   { x: gw.x,             y: gcy }],
    ['right',  { x: gw.x + gw.width,  y: gcy }],
  ]
  return vertices
    .map(([face, v]) => [face, Math.hypot(p.x - v.x, p.y - v.y)] as [Face, number])
    .sort((a, b) => a[1] - b[1])[0][0]
}

/**
 * Cara de salida/entrada dada la posición relativa de dos shapes — igual que
 * BaseRouter.CreatePointDirection cuando ambas origins son shapes (no ports).
 * Esta es la lógica "simple" que asume una única conexión.
 */
function gatewayFace(gw: Shape, other: Shape): Face {
  const dx = cx(other) - cx(gw)
  const dy = cy(other) - cy(gw)
  if (Math.abs(dx) > Math.abs(dy) * 1.5) return dx >= 0 ? 'right' : 'left'
  if (Math.abs(dy) > Math.abs(dx) * 1.5) return dy >= 0 ? 'bottom' : 'top'
  return dy >= 0 ? 'bottom' : 'top'
}

function defaultFace(src: Shape, tgt: Shape): Face {
  const dx = cx(tgt) - cx(src)
  const dy = cy(tgt) - cy(src)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function isShapeCenter(shape: Shape, p: Point): boolean {
  return Math.abs(p.x - cx(shape)) < 1 && Math.abs(p.y - cy(shape)) < 1
}

/**
 * Retorna las caras ya utilizadas por conexiones existentes en un shape.
 * Útil para garantizar que la nueva conexión use una cara diferente.
 */
function usedFaces(shape: Shape, outgoing: boolean, currentConn: Connection): Set<Face> {
  const used = new Set<Face>()
  const conns = (outgoing ? shape.outgoing : shape.incoming) || []
  for (const conn of conns as Connection[]) {
    if (conn === currentConn || !conn.waypoints?.length) continue
    const wp = outgoing ? conn.waypoints[0] : conn.waypoints[conn.waypoints.length - 1]
    const face = isGateway(shape) ? nearestGatewayFace(shape, wp) : nearestFace(shape, wp)
    used.add(face)
  }
  return used
}

/**
 * Traducción de DirectionalRouter.createDirectionalPoints(startShape, endShape).
 *
 * Cuando la figura TARGET ya tiene más de una conexión entrante (o el SOURCE más
 * de una saliente), Bizagi no usa la cara dominante (la más cercana geométricamente)
 * sino que compara la distancia horizontal vs vertical para elegir una cara
 * alternativa. Esto evita que dos flechas salgan/entren por la misma cara y
 * generen zig-zags al intentar rodear los obstáculos de la otra conexión.
 *
 * PARA GATEWAYS: además de la lógica geométrica de Bizagi, verificamos si la cara
 * calculada ya está en uso. Si lo está, rotamos a la siguiente cara libre en orden
 * de prioridad (right → bottom → left → top). Esto garantiza que cada flecha salga
 * de un vértice diferente del rombo.
 *
 * @returns [srcFace, tgtFace] — las caras ajustadas para esta conexión
 */
function pickFacesMultiConn(
  src: Shape, tgt: Shape, connection: Connection
): [Face, Face] {
  const r1 = { left: src.x, right: src.x + src.width,  top: src.y, bottom: src.y + src.height }
  const r2 = { left: tgt.x, right: tgt.x + tgt.width,  top: tgt.y, bottom: tgt.y + tgt.height }

  const outCount = ((src.outgoing || []) as Connection[]).filter(c => c !== connection).length
  const inCount  = ((tgt.incoming || []) as Connection[]).filter(c => c !== connection).length

  let sFace: Face = defaultFace(src, tgt)
  let tFace: Face = defaultFace(tgt, src)

  if (isGateway(src)) sFace = gatewayFace(src, tgt)
  if (isGateway(tgt)) tFace = gatewayFace(tgt, src)

  // Espejo de DirectionalRouter.createDirectionalPoints(startShape, endShape)
  if (r1.right < r2.left) {
    // src está completamente a la izquierda de tgt → caso Right
    const hDist = r2.left - r1.right
    if (inCount > 0) {
      if (r1.bottom < r2.top) {
        // src está arriba de tgt
        const vDist = r2.top - r1.bottom
        tFace = vDist > hDist ? 'top' : 'left'
      } else if (r1.top > r2.bottom) {
        // src está abajo de tgt
        const vDist = r1.top - r2.bottom
        tFace = vDist > hDist ? 'bottom' : 'left'
      } else {
        tFace = 'left' // solapamiento vertical → entrada por la izquierda
      }
    }
    if (outCount > 0) {
      if (r1.top > r2.bottom) {
        const vDist = r1.top - r2.bottom
        sFace = vDist > hDist ? 'top' : 'right'
      } else if (r1.bottom < r2.top) {
        const vDist = r2.top - r1.bottom
        sFace = vDist > hDist ? 'bottom' : 'right'
      } else {
        sFace = 'right'
      }
    }
  } else if (r1.left > r2.right) {
    // src está completamente a la derecha de tgt
    if (r1.top > r2.bottom) {
      sFace = 'top'; tFace = 'bottom'
    } else if (r1.bottom < r2.top) {
      sFace = 'bottom'; tFace = 'top'
    } else {
      // Solapamiento vertical (figuras lado a lado con src a la derecha)
      sFace = 'top'; tFace = 'top'
    }
  } else if (r1.top > r2.bottom) {
    // src está completamente debajo de tgt (vertical)
    // Si ya existe una línea entre ellos en dirección inversa → usar cara derecha
    const hasBackline = ((src.incoming || []) as Connection[]).some(c =>
      c !== connection && c.source?.id === tgt.id
    )
    if (hasBackline) {
      sFace = 'right'; tFace = 'right'
    } else {
      sFace = 'top'; tFace = 'bottom'
    }
  } else {
    // src está completamente encima de tgt (caso Down)
    sFace = 'bottom'; tFace = 'top'
  }

  // NOTA: No aplicamos rotación por "caras usadas" aquí.
  // El C# (createDirectionalPoints) asigna la cara puramente por geometría relativa.
  // Cuando dos conexiones salen por la misma cara de un Gateway, comparten el vértice —
  // eso es comportamiento válido y esperado en Bizagi.

  return [sFace, tFace]
}

function pickFace(shape: Shape, other: Shape, hint?: Point, shapeMoveMode?: boolean): Face {
  if (!shapeMoveMode && hint && !isShapeCenter(shape, hint)) {
    // FIX C: usar nearestGatewayFace para gateways cuando hay hint del ratón
    return isGateway(shape) ? nearestGatewayFace(shape, hint) : nearestFace(shape, hint)
  }
  if (isGateway(shape)) return gatewayFace(shape, other)
  return defaultFace(shape, other)
}

function hasDiagonals(wps: Point[] | null | undefined): boolean {
  if (!wps || wps.length < 2) return false
  for (let i = 1; i < wps.length; i++) {
    if (Math.abs(wps[i].x - wps[i-1].x) > 2 && Math.abs(wps[i].y - wps[i-1].y) > 2) return true
  }
  return false
}

// ── BizagiLayouter ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BizagiLayouter(this: any, elementRegistry: any) {
  this._elementRegistry = elementRegistry
  this._router = new BizagiDirectionalRouter()
}
BizagiLayouter.$inject = ['elementRegistry']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.layoutConnection = function (connection: Connection, hints: any): Point[] {
  hints = hints || {}
  const src: Shape = hints.source || connection.source
  const tgt: Shape = hints.target || connection.target

  if (!src?.width || !src?.height || !tgt?.width || !tgt?.height) return connection.waypoints || []
  if (src === tgt) return connection.waypoints || []

  const hasMovedAnchor = (hints.connectionStart != null && typeof hints.connectionStart === 'object')
                      || (hints.connectionEnd   != null && typeof hints.connectionEnd   === 'object')
  const shapeMoveMode = hints.connectionStart === false
                     || hints.connectionEnd   === false
                     || hasMovedAnchor

  let sFace: Face
  let tFace: Face

  // Para Gateways, la rotación de caras (usedFaces) debe aplicarse SIEMPRE,
  // incluido el shapeMoveMode. El Gateway tiene 4 vértices fijos; dos conexiones
  // nunca pueden compartir el mismo vértice sin producir cruces.
  const srcIsGw = isGateway(src)
  const tgtIsGw = isGateway(tgt)
  const outCount = ((src.outgoing || []) as Connection[]).filter((c: Connection) => c !== connection).length
  const inCount  = ((tgt.incoming || []) as Connection[]).filter((c: Connection) => c !== connection).length
  const hasMultiConn = outCount > 0 || inCount > 0

  if (shapeMoveMode) {
    if ((srcIsGw || tgtIsGw) && hasMultiConn) {
      // Gateway en drag: usar lógica multi-conexión para mantener caras distintas
      ;[sFace, tFace] = pickFacesMultiConn(src, tgt, connection)
    } else {
      // Shape rectangular en drag: cara por geometría simple
      sFace = pickFace(src, tgt, undefined, true)
      tFace = pickFace(tgt, src, undefined, true)
    }
  } else if (hints.connectionStart || hints.connectionEnd) {
    // El usuario arrastró un extremo manualmente: respetar la cara del punto de anclaje
    sFace = pickFace(src, tgt, hints.connectionStart, false)
    tFace = pickFace(tgt, src, hints.connectionEnd,   false)
  } else {
    // Creación automática (Append Task, import, reconexión sin hint):
    if (hasMultiConn) {
      ;[sFace, tFace] = pickFacesMultiConn(src, tgt, connection)
    } else {
      sFace = pickFace(src, tgt)
      tFace = pickFace(tgt, src)
    }
  }

  let start = isGateway(src) ? gatewayCardinal(src, sFace) : faceCardinal(src, sFace)
  let end   = isGateway(tgt) ? gatewayCardinal(tgt, tFace) : faceCardinal(tgt, tFace)

  // NOTA: No aplicamos PORT_OFFSET.
  // El C# (BaseRouter.CreatePointDirection) nunca desplaza el punto cardinal.
  // Si dos conexiones comparten la misma cara, comparten el mismo punto de anclaje.
  // Aplicar un offset desplaza waypoints[0] fuera del vértice/cardinal real,
  // lo que hace que getDiamondDockingPoint y getElementLineIntersection calculen
  // una intersección diagonal en lugar del punto cardinal — causando los diagonales.


  // Recolectar obstáculos
  const obstacles: RouterObstacle[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this._elementRegistry.forEach((el: any) => {
    if (isConnector(el)) return
    if (!el.width || !el.height) return
    if (!el.parent) return
    if (el.type === 'label' || (el.id && el.id.includes('_label'))) return
    // C# equivalente: `value is IRoutingPool || value is IRoutingGroup`
    // Pools, Lanes y Groups son contenedores — no son obstáculos para el router
    if (isRoutingContainer(el)) return
    const obs = toObstacle(el)
    if (el.id === src.id) return
    if (el.id === tgt.id) return
    obstacles.push(obs)
  })

  const router: BizagiDirectionalRouter = this._router

  // Detect drag/modification hints to try and preserve existing route
  const isDragging = ('connectionStart' in hints) || ('connectionEnd' in hints) || ('waypoints' in hints) || hasMovedAnchor
  const existingWaypoints = isDragging && connection.waypoints ? connection.waypoints : undefined

  // Inferir la cara previa desde los waypoints existentes (equivalente a `startDirection` en C# antes de createDirectionalPoints)
  let prevStartDir: Face | undefined
  let prevEndDir: Face | undefined
  if (existingWaypoints && existingWaypoints.length >= 2) {
    const wp0 = existingWaypoints[0]
    const wp1 = existingWaypoints[1]
    prevStartDir = isGateway(src) ? nearestGatewayFace(src, wp0) : nearestFace(src, wp0)
    // Inferir la dirección del primer segmento para confirmar que coincide
    const segDx = wp1.x - wp0.x
    const segDy = wp1.y - wp0.y
    if (Math.abs(segDx) > Math.abs(segDy)) {
      prevStartDir = segDx > 0 ? 'right' : 'left'
    } else if (Math.abs(segDy) > 0) {
      prevStartDir = segDy > 0 ? 'bottom' : 'top'
    }
    const wpL  = existingWaypoints[existingWaypoints.length - 1]
    const wpL1 = existingWaypoints[existingWaypoints.length - 2]
    const segDx2 = wpL.x - wpL1.x
    const segDy2 = wpL.y - wpL1.y
    if (Math.abs(segDx2) > Math.abs(segDy2)) {
      prevEndDir = segDx2 > 0 ? 'right' : 'left'
    } else if (Math.abs(segDy2) > 0) {
      prevEndDir = segDy2 > 0 ? 'bottom' : 'top'
    }
  }

  return router.calculateRoute(
    start, end,
    sFace as Face, tFace as Face,
    obstacles,
    existingWaypoints,
    prevStartDir, prevEndDir,
    toObstacle(src),
    toObstacle(tgt)
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
BizagiLayouter.prototype.repairConnection = function (connection: Connection, _newEnd: any, hints: any): Point[] {
  return this.layoutConnection(connection, hints || {})
}

// ── ConnectionImportNormalizer ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ConnectionImportNormalizer(eventBus: any, elementRegistry: any, modeling: any, layouter: any, commandStack: any) {
  eventBus.on('import.render.complete', 100, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connections: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elementRegistry.forEach((el: any) => { if (el.waypoints) connections.push(el) })

    let fixed = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connections.forEach((conn: any) => {
      if (!conn.source || !conn.target) return
      if (!hasDiagonals(conn.waypoints)) return
      const wp = layouter.layoutConnection(conn, { source: conn.source, target: conn.target })
      if (wp?.length >= 2) { modeling.updateWaypoints(conn, wp); fixed++ }
    })

    if (fixed > 0) commandStack.clear()
  })
}
ConnectionImportNormalizer.$inject = ['eventBus', 'elementRegistry', 'modeling', 'layouter', 'commandStack']

export default {
  __init__: ['connectionImportNormalizer'],
  layouter: ['type', BizagiLayouter],
  connectionImportNormalizer: ['type', ConnectionImportNormalizer],
}
