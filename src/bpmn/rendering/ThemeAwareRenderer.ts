/**
 * ThemeAwareRenderer.ts
 *
 * Custom renderer que extiende BpmnRenderer de bpmn-js para aplicar
 * los colores del tema activo (light/dark) a cada tipo de elemento BPMN.
 *
 * Estrategia: Priority > 1000 → se ejecuta ANTES que el renderer por defecto
 * de bpmn-js. Delegamos al renderer base pasando los colores correctos como
 * `attrs`, que bpmn-js aplica mediante getFillColor/getStrokeColor/getLabelColor.
 *
 * bpmn-js v18 pasa los attrs al método drawShape/drawConnection de los handlers,
 * los cuales llaman a getFillColor(element, defaultColor, attrs.fill).
 * Si el elemento BPMN tiene color forzado en el DI (color="#xxx"), ese valor
 * tiene prioridad. Si no, se usa attrs.fill y luego defaultFillColor.
 * Nosotros siempre ponemos los colores del tema como attrs.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — bpmn-js ships CommonJS without full types
import BpmnRenderer from 'bpmn-js/lib/draw/BpmnRenderer'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import inherits from 'inherits-browser'

import {
  taskColors,
  startEventColors,
  endEventColors,
  intermediateEventColors,
  gatewayColors,
  poolColors,
  laneColors,
  connectionColors,
  defaultColors,
  cssVar,
} from './ThemeColors'
import { isPhase, getPhaseName, getPhaseColor } from '../elements/phaseUtil'
import { isStorageImageRef, getResolvedImage, resolveImageRef } from '@/utils/imageStorage'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — bpmn-js ships CommonJS without full types
import { getLabel } from 'bpmn-js/lib/util/LabelUtil'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { getLabelColor } from 'bpmn-js/lib/draw/BpmnRenderUtil'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PHASE_HEADER = 30 // alto de la banda de nombre (const int TextHeight = 30 en Bizagi)

/** ¿Es la primera fase (más a la izquierda) de su pool? Su borde izquierdo es el
 *  inicio del tren de fases (no hay vecina que dibuje esa frontera). */
function isLeftmostPhase(element: AnyElement): boolean {
  const siblings: AnyElement[] = element.parent?.children ?? []
  for (const s of siblings) {
    if (s === element || !isPhase(s)) continue
    if (Math.abs((s.y ?? 0) - (element.y ?? 0)) > 2) continue
    if ((s.x ?? 0) < (element.x ?? 0) - 1) return false        // hay una fase a la izquierda
  }
  return true
}

/** ¿Es la última fase (más a la derecha)? Su frontera derecha es el borde del
 *  pool → NO dibuja chevron propio: lo dibuja el pool (Opción A). */
function isRightmostPhase(element: AnyElement): boolean {
  const siblings: AnyElement[] = element.parent?.children ?? []
  for (const s of siblings) {
    if (s === element || !isPhase(s)) continue
    if (Math.abs((s.y ?? 0) - (element.y ?? 0)) > 2) continue
    if ((s.x ?? 0) > (element.x ?? 0) + 1) return false        // hay una fase a la derecha
  }
  return true
}

/** ¿El pool (Participant) contiene fases? (fases = hermanos cuyo centro cae
 *  dentro del pool). Si las tiene, su borde derecho se dibuja con chevron. */
function poolHasPhases(pool: AnyElement): boolean {
  const siblings: AnyElement[] = pool.parent?.children ?? []
  const px = pool.x ?? 0, py = pool.y ?? 0, pw = pool.width ?? 0, ph = pool.height ?? 0
  return siblings.some((s: AnyElement) => {
    if (!isPhase(s)) return false
    const cx = (s.x ?? 0) + (s.width ?? 0) / 2
    const cy = (s.y ?? 0) + (s.height ?? 0) / 2
    return cx >= px && cx <= px + pw && cy >= py && cy <= py + ph
  })
}

// ──────────────────────────────────────────────────────────────
// Utilidad: ¿es un elemento de este tipo?
// ──────────────────────────────────────────────────────────────
function isType(element: AnyElement, type: string): boolean {
  const bo = element.businessObject
  if (!bo) return false
  // bo.$instanceOf está disponible en todos los business objects de bpmn-moddle
  return typeof bo.$instanceOf === 'function' && bo.$instanceOf(type)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyElement = any

// ──────────────────────────────────────────────────────────────
// Colores por tipo de elemento
// ──────────────────────────────────────────────────────────────
function getColorsFor(element: AnyElement): {
  fill: string
  stroke: string
  labelColor: string
} {
  // Tareas (todos los subtipos)
  if (
    isType(element, 'bpmn:Task') ||
    isType(element, 'bpmn:UserTask') ||
    isType(element, 'bpmn:ServiceTask') ||
    isType(element, 'bpmn:SendTask') ||
    isType(element, 'bpmn:ReceiveTask') ||
    isType(element, 'bpmn:ManualTask') ||
    isType(element, 'bpmn:ScriptTask') ||
    isType(element, 'bpmn:BusinessRuleTask') ||
    isType(element, 'bpmn:CallActivity')
  ) {
    return taskColors()
  }

  // SubProcesos
  if (isType(element, 'bpmn:SubProcess')) {
    return taskColors()
  }

  // Evento de inicio
  if (isType(element, 'bpmn:StartEvent')) {
    return startEventColors()
  }

  // Evento de fin
  if (isType(element, 'bpmn:EndEvent')) {
    return endEventColors()
  }

  // Eventos intermedios
  if (
    isType(element, 'bpmn:IntermediateCatchEvent') ||
    isType(element, 'bpmn:IntermediateThrowEvent') ||
    isType(element, 'bpmn:BoundaryEvent')
  ) {
    return intermediateEventColors()
  }

  // Compuertas (todos los subtipos)
  if (
    isType(element, 'bpmn:ExclusiveGateway') ||
    isType(element, 'bpmn:ParallelGateway') ||
    isType(element, 'bpmn:InclusiveGateway') ||
    isType(element, 'bpmn:ComplexGateway') ||
    isType(element, 'bpmn:EventBasedGateway') ||
    isType(element, 'bpmn:Gateway')
  ) {
    return gatewayColors()
  }

  // Pools (Participant)
  if (isType(element, 'bpmn:Participant')) {
    return poolColors()
  }

  // Lanes
  if (isType(element, 'bpmn:Lane')) {
    return laneColors()
  }

  return defaultColors()
}

// ──────────────────────────────────────────────────────────────
// ThemeAwareRenderer — hereda de BpmnRenderer
// ──────────────────────────────────────────────────────────────

/**
 * @param {object} config
 * @param {import('diagram-js/lib/core/EventBus').default} eventBus
 * @param {import('diagram-js/lib/draw/Styles').default} styles
 * @param {import('bpmn-js/lib/draw/PathMap').default} pathMap
 * @param {import('diagram-js/lib/core/Canvas').default} canvas
 * @param {import('bpmn-js/lib/draw/TextRenderer').default} textRenderer
 */
function ThemeAwareRenderer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBus: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pathMap: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textRenderer: any,
) {
  // Prioridad > 1000 para que se ejecute ANTES del BpmnRenderer por defecto
  BpmnRenderer.call(this, config, eventBus, styles, pathMap, canvas, textRenderer, 1500)
  // Para re-renderizar una imagen cuando su referencia de Storage se resuelve async.
  this._imgEventBus = eventBus
  // Para renderizar labels externos con su propio tamaño (ResizableLabelsModule).
  this._textRenderer = textRenderer
}

inherits(ThemeAwareRenderer, BpmnRenderer)

ThemeAwareRenderer.$inject = [
  'config.bpmnRenderer',
  'eventBus',
  'styles',
  'pathMap',
  'canvas',
  'textRenderer',
]

/**
 * Puede renderizar cualquier elemento que el BpmnRenderer base puede.
 */
ThemeAwareRenderer.prototype.canRender = function (element: AnyElement): boolean {
  // Labels externos incluidos: los renderizamos nosotros para que el texto
  // se envuelva al tamaño real del label (el base usa caja fija 90×30).
  return BpmnRenderer.prototype.canRender.call(this, element)
}

/**
 * Dibuja una shape inyectando los colores del tema.
 */
ThemeAwareRenderer.prototype.drawShape = function (
  parentGfx: SVGElement,
  element: AnyElement,
): SVGElement {
  const colors = getColorsFor(element)

  // Label externo (eventos, gateways, conexiones): renderizar el texto
  // envolviéndolo al tamaño REAL del label — el base renderer usa una caja
  // fija de 90×30 e ignora element.width/height, lo que impide redimensionar.
  if (element.labelTarget) {
    const w = Number.isFinite(element.width) && element.width > 0 ? element.width : 90
    const h = Number.isFinite(element.height) && element.height > 0 ? element.height : 30
    const text = this._textRenderer.createText(getLabel(element) || '', {
      box: { width: w, height: h },
      align: 'center-middle',
      fitBox: true, // no truncar palabras más largas que la caja
      style: {
        ...this._textRenderer.getExternalStyle(),
        // Respeta color DI si existe; si no, color de texto del tema
        fill: getLabelColor(element, colors.labelColor, colors.labelColor),
      },
    })
    text.setAttribute('class', 'djs-label')
    parentGfx.appendChild(text)
    return text
  }

  // Fase / Milestone — estilo Bizagi. Cada fase es una banda con chevron derecho:
  //   - El RELLENO incluye el chevron (su interior es parte de la fase) y, salvo
  //     la primera, una muesca izquierda para encajar con el chevron de la previa.
  //   - Frontera derecha: chevron PUNTEADO entre fases; SÓLIDO en la última (es la
  //     frontera/borde del pool).
  if (isPhase(element)) {
    // Guarda anti-NaN: si el elemento llega con dimensiones inválidas, no emitir
    // atributos NaN al SVG (rompen el render de toda la página).
    const w: number = Number.isFinite(element.width) ? element.width : 0
    const h: number = Number.isFinite(element.height) ? element.height : 0
    const color = getPhaseColor(element)
    const LABEL = PHASE_HEADER // 30 px (const int TextHeight = 30 en Bizagi)
    const ARROW = 15           // protrusión de la flecha (num = 15f en Render())
    const first = isLeftmostPhase(element)
    const last = isRightmostPhase(element)

    // Cuerpo: relleno del color de la fase INCLUYENDO el chevron derecho. La
    // primera fase tiene borde izquierdo recto; las demás, muesca izquierda que
    // recibe el chevron de la fase anterior (encaje sin solape).
    const fillD = first
      ? `M0,0 L${w},0 L${w + ARROW},${ARROW} L${w},${LABEL} L${w},${h} L0,${h} Z`
      : `M0,0 L${w},0 L${w + ARROW},${ARROW} L${w},${LABEL} L${w},${h} L0,${h} L0,${LABEL} L${ARROW},${ARROW} Z`
    const body = document.createElementNS(SVG_NS, 'path')
    body.setAttribute('d', fillD)
    body.setAttribute('fill', color)
    body.setAttribute('fill-opacity', '0.10')
    body.setAttribute('stroke', 'none')
    parentGfx.appendChild(body)

    // Fronteras: trazo del color de borde del tema (no del color de la fase).
    const stroke = cssVar('--border-strong') || '#505050'
    const frontier = (d: string, dashed: boolean) => {
      const p = document.createElementNS(SVG_NS, 'path')
      p.setAttribute('d', d)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke', stroke)
      p.setAttribute('stroke-width', '1.5') // un poco más marcado, sin exagerar
      if (dashed) p.setAttribute('stroke-dasharray', '7 4') // DashPattern {7,4}
      parentGfx.appendChild(p)
    }
    // Inicio (izquierda) de la PRIMERA fase: línea recta punteada.
    if (first) frontier(`M0,0 L0,${h}`, true)
    // Fin (derecha) = chevron PUNTEADO solo si es divisor interno. La última fase
    // NO lo dibuja: su chevron lo dibuja el pool (sólido, borde del pool).
    if (!last) frontier(`M${w},0 L${w + ARROW},${ARROW} L${w},${LABEL} L${w},${h}`, true)

    const name: string = getPhaseName(element)
    if (name) {
      const text = document.createElementNS(SVG_NS, 'text')
      text.setAttribute('class', 'djs-phase-name') // para ocultarlo al editar inline
      text.setAttribute('x', String(w / 2))
      text.setAttribute('y', String(LABEL / 2))
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dominant-baseline', 'central')
      text.setAttribute('font-size', '12')
      text.setAttribute('font-weight', '700') // Bizagi: Formatting.Bold = true
      text.setAttribute('fill', '#1f2937')     // texto oscuro sobre fondo claro
      text.textContent = name
      parentGfx.appendChild(text)
    }
    return body
  }

  // ExclusiveGateway: bypass base renderer to draw a clean diamond without
  // the X marker. Base renderer always draws the X cross path on top.
  if (isType(element, 'bpmn:ExclusiveGateway')) {
    const w: number = element.width
    const h: number = element.height
    const x2 = w / 2
    const y2 = h / 2
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    polygon.setAttribute('points', `${x2},0 ${w},${y2} ${x2},${h} 0,${y2}`)
    polygon.setAttribute('fill', colors.fill)
    polygon.setAttribute('stroke', colors.stroke)
    polygon.setAttribute('stroke-width', '2')
    polygon.setAttribute('stroke-linejoin', 'round')
    parentGfx.appendChild(polygon)
    return polygon
  }

  // Interceptar la imagen simulada en TextAnnotation
  if (isType(element, 'bpmn:TextAnnotation') && element.businessObject.text?.startsWith('[IMAGE:')) {
    let url = element.businessObject.text.replace('[IMAGE:', '').replace(']', '')
    // Referencia de Storage (storage://diagram-images/...): resolver a objectURL.
    // El renderer es síncrono → si aún no está en caché, se dispara la descarga
    // y al resolverse se fuerza el re-render de ESTE elemento; mientras tanto se
    // muestra solo el rect punteado (placeholder ya existente).
    if (isStorageImageRef(url)) {
      const cached = getResolvedImage(url)
      if (cached) {
        url = cached
      } else {
        const bus = this._imgEventBus
        void resolveImageRef(url).then((ok) => {
          if (ok) { try { bus?.fire('element.changed', { element }) } catch { /* noop */ } }
        })
        url = ''
      }
    }
    const w = element.width
    const h = element.height

    // Crear la imagen SVG
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    if (url) image.setAttribute('href', url)
    image.setAttribute('width', w.toString())
    image.setAttribute('height', h.toString())
    image.setAttribute('preserveAspectRatio', 'none')
    
    // Borde sutil para saber que está ahí si la imagen no carga
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('width', w.toString())
    rect.setAttribute('height', h.toString())
    rect.setAttribute('fill', 'transparent')
    rect.setAttribute('stroke', '#ccc')
    rect.setAttribute('stroke-dasharray', '4')
    
    parentGfx.appendChild(image)
    parentGfx.appendChild(rect)
    return rect // Retornar el rect para que diagram-js pueda hacer hit-testing (selección)
  }

  // Pool con fases → su borde derecho termina en chevron (Opción A, estilo Bizagi):
  // se deja que el base dibuje el pool normal y luego se "convierte" el borde
  // derecho superior en chevron (tapando el tramo recto + saliente relleno + borde).
  if (isType(element, 'bpmn:Participant') && poolHasPhases(element)) {
    const gfx = BpmnRenderer.prototype.drawShape.call(this, parentGfx, element, {
      fill: colors.fill,
      stroke: colors.stroke,
      defaultLabelColor: colors.labelColor,
    })
    const w = Number.isFinite(element.width) ? element.width : 0
    const ARROW = 15
    const LABEL = PHASE_HEADER
    // Máscara: tapa el tramo recto del borde derecho (y 0..LABEL) y rellena el
    // saliente del chevron con el color del pool (lo hace parte del pool).
    const mask = document.createElementNS(SVG_NS, 'path')
    mask.setAttribute('d', `M${w - 1},0 L${w + ARROW},${ARROW} L${w - 1},${LABEL} Z`)
    mask.setAttribute('fill', colors.fill || '#ffffff')
    mask.setAttribute('stroke', 'none')
    parentGfx.appendChild(mask)
    // Borde del chevron (sólido, color de borde del pool).
    const chev = document.createElementNS(SVG_NS, 'path')
    chev.setAttribute('d', `M${w},0 L${w + ARROW},${ARROW} L${w},${LABEL}`)
    chev.setAttribute('fill', 'none')
    chev.setAttribute('stroke', colors.stroke || '#94a3b8')
    chev.setAttribute('stroke-width', '2')
    parentGfx.appendChild(chev)
    return gfx
  }

  // Pasamos los colores como attrs — bpmn-js los aplica a través de
  // getFillColor / getStrokeColor / getLabelColor respetando el color DI
  return BpmnRenderer.prototype.drawShape.call(this, parentGfx, element, {
    fill:       colors.fill,
    stroke:     colors.stroke,
    defaultLabelColor: colors.labelColor,
  })
}

/**
 * Dibuja una conexión con el color del tema.
 * Los círculos de endpoints se manejan por ConnectionEndpointCirclesModule.
 */
ThemeAwareRenderer.prototype.drawConnection = function (
  parentGfx: SVGElement,
  element: AnyElement,
): SVGElement {
  const colors = connectionColors()
  return BpmnRenderer.prototype.drawConnection.call(this, parentGfx, element, {
    stroke:     colors.stroke,
    defaultLabelColor: colors.labelColor,
  })
}

export default ThemeAwareRenderer
