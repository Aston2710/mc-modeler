/**
 * OrthogonalityBehavior — invariante de ortogonalidad a nivel de comando.
 *
 * Garantiza que NINGÚN camino de código deje una conexión con segmentos
 * diagonales o extremos desanclados: tras cada comando que pueda tocar
 * waypoints, verifica el invariante y, si se violó, lo repara DENTRO del
 * mismo comando (updateWaypoints anidado en postExecuted → misma unidad de
 * undo, un solo commandStack.changed, un solo snapshot Yjs).
 *
 * Idempotente por diseño: si el invariante ya se cumple no toca nada — esto
 * es lo que evita ping-pong con el correctivePass de la colaboración (los
 * waypoints remotos ya vienen normalizados por el mismo código del peer).
 *
 * Sustituye al rol de "red de seguridad" del WaypointRounder, pero desde el
 * commandStack (el rounder reacciona a connection.changed fuera de comando,
 * lo que contamina undo/redo).
 */

 
// @ts-ignore
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor'
import { isOrthogonal, repairChainFromStart, repairChainFromEnd, dockPoint, routeInvades, isExactOrthogonal, snapOrthogonal, type Point } from './orthogonal'
import { isManual } from './manualRoute'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function isGateway(el: AnyObj): boolean {
  const bo = el?.businessObject
  return !!(bo && typeof bo.$instanceOf === 'function' && bo.$instanceOf('bpmn:Gateway'))
}

function isConnection(el: AnyObj): boolean {
  return Array.isArray(el?.waypoints) && !!el.source && !!el.target
}

// ── Guardas anti-NaN ────────────────────────────────────────────────────────
// Una Association cuyo extremo es otra conexión (BPMN inválido) no tiene bounds
// → el docking produce NaN → bpmn-js core lanza al re-rutear y CORROMPE el
// diagrama de forma persistente. Nunca operar sobre extremos sin bounds ni
// escribir waypoints no finitos. Ver docs/plan-canvas-y-fix-corrupcion.md.
function isFinitePt(p: Point): boolean {
  return Number.isFinite(p?.x) && Number.isFinite(p?.y)
}
function allFinite(wps: Point[] | null | undefined): boolean {
  return Array.isArray(wps) && wps.length >= 2 && wps.every(isFinitePt)
}
function endpointsHaveBounds(conn: AnyObj): boolean {
  const s = conn?.source, t = conn?.target
  return Number.isFinite(s?.x) && Number.isFinite(s?.width) &&
         Number.isFinite(t?.x) && Number.isFinite(t?.width)
}

// Associations (a anotaciones/data) pueden cruzar shapes: se excluyen del
// chequeo de invasión (igual que en el layouter).
function isAssociation(conn: AnyObj): boolean {
  const bo = conn?.businessObject
  if (!bo || typeof bo.$instanceOf !== 'function') return false
  return bo.$instanceOf('bpmn:Association')
      || bo.$instanceOf('bpmn:DataInputAssociation')
      || bo.$instanceOf('bpmn:DataOutputAssociation')
}

/** El extremo debe tocar (o estar dentro de) el bbox del shape, con tolerancia. */
function touchesShape(shape: AnyObj, p: Point, tol = 2): boolean {
  return (
    p.x >= shape.x - tol &&
    p.x <= shape.x + shape.width + tol &&
    p.y >= shape.y - tol &&
    p.y <= shape.y + shape.height + tol
  )
}

function violatesInvariant(conn: AnyObj): boolean {
  const wps: Point[] | undefined = conn.waypoints
  if (!wps || wps.length < 2) return false
  if (!isOrthogonal(wps)) return true
  if (!touchesShape(conn.source, wps[0])) return true
  if (!touchesShape(conn.target, wps[wps.length - 1])) return true
  // Capa 3: invasión de los propios src/tgt (el bug del screenshot: la flecha
  // entra y hace esquina DENTRO del shape). routeInvades usa interior estricto
  // → el dock legítimo sobre el borde no dispara.
  if (!isAssociation(conn) && conn.source !== conn.target) {
    if (routeInvades(wps, conn.source)) return true
    if (routeInvades(wps, conn.target)) return true
  }
  return false
}

const AFFECTING_COMMANDS = [
  'connection.create',
  'connection.layout',
  'connection.updateWaypoints',
  'connection.reconnect',
  'connection.move',
  'shape.move',
  'shape.resize',
  'shape.replace',
  'elements.move',
  'elements.create',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OrthogonalityBehavior(this: any, injector: AnyObj, modeling: AnyObj, layouter: AnyObj, elementRegistry: AnyObj) {
  injector.invoke(CommandInterceptor, this)

  // guard contra no-convergencia: nunca reparar dos veces la misma conexión
  // dentro de la misma pila de reparación
  const fixing = new Set<string>()

  const round = (wps: Point[]) => wps.map((p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) }))

  // Re-ruta LIMPIA una conexión (ignora forma manual): usada cuando un shape
  // ajeno se movió encima de su camino y la volvió inválida. forceReroute hace
  // que el layouter descarte la forma manual y devuelva la solución fresca ya
  // saneada por ensureClean; si era manual, se limpia el flag en el mismo comando.
  function rerouteClean(conn: AnyObj): void {
    if (!endpointsHaveBounds(conn)) return
    const wps = layouter.layoutConnection(conn, { source: conn.source, target: conn.target, forceReroute: true })
    if (wps?.length >= 2 && allFinite(wps)) {
      modeling.updateWaypoints(conn, round(wps))
      if (isManual(conn) && conn.businessObject) {
        modeling.updateModdleProperties(conn, conn.businessObject, { 'flujo:manualRoute': undefined })
      }
    }
  }

  function collectConnections(command: string, context: AnyObj): AnyObj[] {
    const out: AnyObj[] = []
    const push = (c: AnyObj) => { if (c && isConnection(c) && !out.includes(c)) out.push(c) }
    const pushShapeConns = (s: AnyObj) => {
      ;((s?.incoming as AnyObj[]) || []).forEach(push)
      ;((s?.outgoing as AnyObj[]) || []).forEach(push)
    }
    switch (command) {
      case 'connection.create':
      case 'connection.layout':
      case 'connection.updateWaypoints':
      case 'connection.reconnect':
      case 'connection.move':
        push(context.connection)
        break
      case 'shape.move':
      case 'shape.resize':
        pushShapeConns(context.shape)
        break
      case 'shape.replace':
        pushShapeConns(context.newShape)
        break
      case 'elements.move':
        ;((context.shapes as AnyObj[]) || []).forEach(pushShapeConns)
        break
      case 'elements.create':
        ;((context.elements as AnyObj[]) || []).forEach((el: AnyObj) => {
          if (isConnection(el)) push(el)
          else pushShapeConns(el)
        })
        break
    }
    return out
  }

  function repair(conn: AnyObj): void {
    const src = conn.source
    const tgt = conn.target
    if (!src?.width || !tgt?.width) return

    let wps: Point[]
    let manualDiscarded = false

    if (src !== tgt && isManual(conn) && conn.waypoints.length >= 2) {
      // manual: reparación en cadena preservando la forma. Si el extremo actual
      // ya toca el shape (p. ej. tras reconnect/crop), usarlo como ancla para
      // conservar el dock que eligió el usuario; si está desanclado, derivar
      // del waypoint vecino.
      wps = conn.waypoints.map((p: Point) => ({ x: p.x, y: p.y }))
      const sAnchor = touchesShape(src, wps[0]) ? wps[0] : (wps[1] ?? wps[wps.length - 1])
      const sDock = dockPoint(src, sAnchor, isGateway(src) ? 'gateway' : 'rect')
      wps = repairChainFromStart(wps, sDock, sDock.face)
      const tAnchor = touchesShape(tgt, wps[wps.length - 1]) ? wps[wps.length - 1] : (wps[wps.length - 2] ?? wps[0])
      const tDock = dockPoint(tgt, tAnchor, isGateway(tgt) ? 'gateway' : 'rect')
      wps = repairChainFromEnd(wps, tDock, tDock.face)
      // Solo se descarta la forma manual cuando la reparación no logra una ruta
      // VÁLIDA (queda diagonal o metida dentro de un extremo). Mientras sea
      // ortogonal y no invada src/tgt, la edición del usuario se respeta.
      if (!isOrthogonal(wps) || routeInvades(wps, src) || routeInvades(wps, tgt)) {
        wps = layouter.layoutConnection(conn, { source: src, target: tgt, forceReroute: true })
        manualDiscarded = true
      }
    } else {
      // auto (o self-loop): re-layout completo del router
      wps = layouter.layoutConnection(conn, { source: src, target: tgt })
    }

    const snapped = wps?.length >= 2 ? snapOrthogonal(wps) : null
    if (snapped && allFinite(snapped)) {
      if (import.meta.env?.DEV) {
        console.warn('[ortho] invariante violado, reparando', conn.id)
      }
      // Commit en ortogonal EXACTA (enteros, 0px) — garantiza arrastrabilidad.
      modeling.updateWaypoints(conn, snapped)
      if (manualDiscarded && conn.businessObject) {
        modeling.updateModdleProperties(conn, conn.businessObject, { 'flujo:manualRoute': undefined })
      }
    }
  }

  // Al borrar una conexión, las paralelas restantes entre el mismo par se
  // re-layoutean (solo autos) para que la separación ±10px se re-centre.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.postExecuted('connection.delete', 500, (event: any) => {
    const ctx = event.context
    const src = ctx?.source
    const tgt = ctx?.target
    if (!src || !tgt || src === tgt) return
    const siblings = (((src.outgoing as AnyObj[]) || []).filter((c) => c.target === tgt))
      .concat(((src.incoming as AnyObj[]) || []).filter((c) => c.source === tgt))
      .filter((c) => isConnection(c) && !isManual(c))
    for (const c of siblings) {
      modeling.layoutConnection(c, { source: c.source, target: c.target })
    }
  })

  // ── Capa 4: conexiones de TERCEROS invadidas por un shape movido ──────────
  // Al mover/redimensionar un shape, además de re-rutear sus propias conexiones
  // (flujo nativo), se re-rutean las conexiones AJENAS cuyo camino ahora pasa
  // por dentro del shape movido — el comportamiento Bizagi "las flechas se
  // apartan cuando les plantas un shape encima" (findings §13). Solo las que
  // realmente invaden; associations se respetan (pueden cruzar).
  // Prioridad 400: después del invariante (500), sobre el estado ya ortogonal.
  // Cubre mover/redimensionar Y crear (soltar un shape nuevo encima de una flecha).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.postExecuted(['shape.move', 'shape.resize', 'elements.move', 'shape.create', 'elements.create'], 400, (event: any) => {
    const ctx = event.context
    const moved: AnyObj[] = []
    if (ctx.shape) moved.push(ctx.shape)
    if (Array.isArray(ctx.shapes)) moved.push(...ctx.shapes)
    if (Array.isArray(ctx.elements)) moved.push(...ctx.elements)
    const movedRects = moved.filter((s) => s?.width && s?.height && !isConnection(s))
    if (!movedRects.length) return

    elementRegistry.forEach((conn: AnyObj) => {
      // Autos únicamente: una ruta MANUAL invadida por un shape ajeno se respeta
      // (prioridad a la decisión del usuario; él la ajusta si quiere). Solo las
      // automáticas se apartan al plantarles un shape encima.
      if (!isConnection(conn) || fixing.has(conn.id) || isAssociation(conn) || isManual(conn)) return
      for (const s of movedRects) {
        if (conn.source === s || conn.target === s) continue // sus propias conexiones ya se trataron
        if (routeInvades(conn.waypoints, s)) {
          fixing.add(conn.id)
          try { rerouteClean(conn) } finally { fixing.delete(conn.id) }
          break
        }
      }
    })
  })

  // Prioridad 500: correr DESPUÉS de ManualRouteBehavior (1500) y de los
  // behaviors nativos, como última verificación del comando.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.postExecuted(AFFECTING_COMMANDS, 500, (event: any) => {
    const connections = collectConnections(event.command, event.context)
    for (const conn of connections) {
      if (fixing.has(conn.id)) continue
      // Extremo sin bounds (p. ej. Association a otra conexión, BPMN inválido):
      // el layouter derivaría NaN. No tocar — la regla de conexión impide crear
      // esto, y el saneo de import descarta su DI.
      if (!endpointsHaveBounds(conn)) continue
      if (violatesInvariant(conn)) {
        fixing.add(conn.id)
        try {
          repair(conn)
        } finally {
          fixing.delete(conn.id)
        }
        continue
      }
      // Snap a ortogonal EXACTA (enteros, 0px de desalineación) DENTRO del comando.
      // Garantiza que TODO segmento sea arrastrable: diagram-js exige alineación
      // (ALIGNED_THRESHOLD) para crear el handle y no abortar el segment-move.
      // Espejo de SetSolution de Bizagi: los puntos commiteados SON siempre la
      // solución ortogonal exacta → nunca un segmento "que no se mueve".
      // Ver fix_doc/routing-orthogonal-invariant-and-shape-invasion.md §5d.
      const wps: AnyObj[] = conn.waypoints
      if (!isExactOrthogonal(wps)) {
        const snapped: AnyObj[] = snapOrthogonal(wps)
        // preservar 'original' por índice si no hubo colapso (hint de docking del drag)
        if (snapped.length === wps.length) {
          snapped.forEach((p, i) => { if (wps[i].original) p.original = { x: Math.round(wps[i].original.x), y: Math.round(wps[i].original.y) } })
        }
        if (snapped.length >= 2 && allFinite(snapped)) {
          fixing.add(conn.id)
          try {
            modeling.updateWaypoints(conn, snapped)
          } finally {
            fixing.delete(conn.id)
          }
        }
      }
    }
  })
}

OrthogonalityBehavior.prototype = Object.create(CommandInterceptor.prototype)
OrthogonalityBehavior.prototype.constructor = OrthogonalityBehavior
OrthogonalityBehavior.$inject = ['injector', 'modeling', 'layouter', 'elementRegistry']

export default {
  __init__: ['orthogonalityBehavior'],
  orthogonalityBehavior: ['type', OrthogonalityBehavior],
}
