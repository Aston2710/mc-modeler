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
import { isOrthogonal, repairChainFromStart, repairChainFromEnd, dockPoint, routeInvades, type Point } from './orthogonal'
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
    const wps = layouter.layoutConnection(conn, { source: conn.source, target: conn.target, forceReroute: true })
    if (wps?.length >= 2) {
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

    if (wps?.length >= 2) {
      if (import.meta.env?.DEV) {
        console.warn('[ortho] invariante violado, reparando', conn.id)
      }
      modeling.updateWaypoints(conn, wps.map((p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) })))
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
      if (violatesInvariant(conn)) {
        fixing.add(conn.id)
        try {
          repair(conn)
        } finally {
          fixing.delete(conn.id)
        }
        continue
      }
      // Redondeo de floats (residuo del crop por intersección de paths) DENTRO
      // del comando — antes lo hacía WaypointRounder desde connection.changed,
      // fuera de comando, contaminando la pila de undo/redo.
      const wps: AnyObj[] = conn.waypoints
      const rounded = wps.map((p: AnyObj) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        ...(p.original ? { original: { x: Math.round(p.original.x), y: Math.round(p.original.y) } } : {}),
      }))
      if (wps.some((p: AnyObj, i: number) => p.x !== rounded[i].x || p.y !== rounded[i].y)) {
        fixing.add(conn.id)
        try {
          modeling.updateWaypoints(conn, rounded)
        } finally {
          fixing.delete(conn.id)
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
