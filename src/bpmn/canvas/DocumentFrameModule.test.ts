// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import DocumentFrameModuleDefault from './DocumentFrameModule'
import { DEFAULT_DOCUMENT_HEADER, type DocumentHeaderTemplate } from '@/utils/documentHeader'
import { DEFAULT_PAGE_SPEC, drawingArea } from '@/utils/pageLayout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod = DocumentFrameModuleDefault as any
const DocumentFrame = mod.documentFrame[1]

/** eventBus falso: guarda los handlers para poder disparar 'canvas.init'. */
function makeBus() {
  const handlers: Record<string, ((e?: AnyObj) => unknown)[]> = {}
  return {
    on(event: string, fn: (e?: AnyObj) => unknown) {
      (handlers[event] ??= []).push(fn)
    },
    fire(event: string, e?: AnyObj) {
      for (const fn of handlers[event] ?? []) fn(e)
    },
    has(event: string) { return !!handlers[event]?.length },
  }
}

/** Registro falso con formas sueltas. `waypoints` marca una conexión. */
function makeRegistry(elements: AnyObj[]) {
  return { forEach: (fn: (el: AnyObj) => void) => elements.forEach(fn) }
}

const RAIZ_SIN_DATOS = { businessObject: { $type: 'bpmn:Process' } }

function makeCanvas(container: HTMLElement, viewbox: AnyObj) {
  return {
    getContainer: () => container,
    viewbox: () => viewbox,
    getRootElement: () => RAIZ_SIN_DATOS,
  }
}

/**
 * Monta el módulo y devuelve la banda ya renderizada, o null.
 *
 * `requestAnimationFrame` se sustituye por una llamada inmediata: el módulo
 * agrupa los repintados en un frame, y sin esto la prueba tendría que esperar.
 */
function montar(opts: {
  tpl?: DocumentHeaderTemplate | null
  visible?: boolean
  elements?: AnyObj[]
  viewbox?: AnyObj
  size?: { w: number; h: number }
}) {
  const container = document.createElement('div')
  const { w = 1200, h = 800 } = opts.size ?? {}
  document.body.appendChild(container)

  const bus = makeBus()
  const canvas = makeCanvas(container, opts.viewbox ?? { x: 0, y: 0, width: w, height: h, scale: 1 })
  const registry = makeRegistry(opts.elements ?? [
    { parent: {}, type: 'bpmn:Task', x: 100, y: 300, width: 400, height: 80 },
    { parent: {}, type: 'bpmn:Task', x: 700, y: 300, width: 400, height: 80 },
  ])

  const frame = new DocumentFrame(bus, canvas, registry)
  bus.fire('canvas.init')
  frame.setVisible(opts.visible ?? true)
  frame.setTemplate(opts.tpl === undefined ? { ...DEFAULT_DOCUMENT_HEADER, enabled: true } : opts.tpl)

  return {
    frame, bus, container,
    banda: () => container.querySelector('.doc-frame__band') as HTMLElement | null,
    overlay: () => container.querySelector('.doc-frame') as HTMLElement | null,
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

describe('DocumentFrameModule · la frontera con el modelo (D-A del plan)', () => {
  /**
   * Esta es LA prueba del plan: la cabecera no puede acabar dentro del modelo.
   * Si alguien inyecta `modeling` o `bpmnFactory` aquí es porque va a crear un
   * elemento, y eso rompe el `.bpmn`, el routing y la colaboración.
   */
  it('no puede tocar el modelo: no inyecta modeling ni fábricas', () => {
    expect(DocumentFrame.$inject).toEqual(['eventBus', 'canvas', 'elementRegistry'])
    for (const prohibido of ['modeling', 'bpmnFactory', 'elementFactory', 'commandStack', 'moddle']) {
      expect(DocumentFrame.$inject).not.toContain(prohibido)
    }
  })

  it('la capa es del contenedor del canvas, no del modelo', () => {
    const { overlay } = montar({})
    expect(overlay()).not.toBeNull()
    expect(overlay()?.getAttribute('data-document-frame')).toBe('true')
  })

  it('se limpia al destruir el diagrama', () => {
    const { bus, container } = montar({})
    bus.fire('diagram.destroy')
    expect(container.querySelector('.doc-frame')).toBeNull()
  })
})

describe('DocumentFrameModule · cuándo no dibuja nada', () => {
  it('sin plantilla', () => {
    expect(montar({ tpl: null }).banda()).toBeNull()
  })

  it('con la plantilla apagada', () => {
    expect(montar({ tpl: { ...DEFAULT_DOCUMENT_HEADER, enabled: false } }).banda()).toBeNull()
  })

  it('con la vista apagada, aunque el proyecto tenga plantilla', () => {
    expect(montar({ visible: false }).banda()).toBeNull()
  })

  it('con el lienzo vacío', () => {
    expect(montar({ elements: [] }).banda()).toBeNull()
  })

  it('cuando solo hay conexiones: una flecha no acota una caja', () => {
    const elements = [{ parent: {}, waypoints: [{ x: 0, y: 0 }, { x: 90, y: 0 }], x: 0, y: 0 }]
    expect(montar({ elements }).banda()).toBeNull()
  })

  it('a zoom tan bajo que la banda sería un borrón', () => {
    const viewbox = { x: 0, y: 0, width: 60_000, height: 40_000, scale: 0.02 }
    expect(montar({ viewbox }).banda()).toBeNull()
  })

  it('cuando el contenido queda fuera del viewport', () => {
    const viewbox = { x: 40_000, y: 40_000, width: 1200, height: 800, scale: 1 }
    expect(montar({ viewbox }).banda()).toBeNull()
  })
})

describe('DocumentFrameModule · geometría', () => {
  it('abarca el ancho del contenido y se apoya encima', () => {
    const { banda } = montar({})
    const b = banda()!
    // Contenido: de x=100 a x=1100 → 1000 de ancho, y empieza en y=300.
    expect(b.style.left).toBe('100px')
    expect(b.style.width).toBe('1000px')

    // Alto = (18 mm / ancho de la zona de dibujo) × 1000.
    const refMm = drawingArea({ ...DEFAULT_PAGE_SPEC, headerHeight: 0 }).width
    const esperado = (DEFAULT_DOCUMENT_HEADER.height / refMm) * 1000
    expect(parseFloat(b.style.height)).toBeCloseTo(esperado, 6)

    // Y queda POR ENCIMA del contenido, sin solaparlo.
    const top = parseFloat(b.style.top)
    expect(top + esperado).toBeLessThanOrEqual(300)
    expect(b.classList.contains('is-overlapping')).toBe(false)
  })

  it('escala con el zoom', () => {
    const viewbox = { x: 0, y: 0, width: 2400, height: 1600, scale: 0.5 }
    const b = montar({ viewbox }).banda()!
    expect(b.style.left).toBe('50px')
    expect(b.style.width).toBe('500px')
  })

  /**
   * Es el caso frecuente y no el raro: con un diagrama ancho la banda mide más
   * que el aire que suele haber sobre el contenido. Se apoya en el origen y se
   * marca traslúcida antes que mover los elementos del usuario.
   */
  it('sin sitio arriba, se apoya en el origen y avisa de que solapa', () => {
    const elements = [{ parent: {}, type: 'bpmn:Task', x: 0, y: 10, width: 3000, height: 80 }]
    const b = montar({ elements })!.banda()!
    expect(b.style.top).toBe('0px')
    expect(b.classList.contains('is-overlapping')).toBe(true)
  })

  it('las etiquetas no estiran la banda', () => {
    const elements = [
      { parent: {}, type: 'bpmn:Task', x: 500, y: 400, width: 100, height: 80 },
      { parent: {}, type: 'label', x: 0, y: 0, width: 5000, height: 20 },
    ]
    const b = montar({ elements }).banda()!
    expect(b.style.left).toBe('500px')
    expect(b.style.width).toBe('100px')
  })
})

describe('DocumentFrameModule · contenido de las celdas', () => {
  it('tres celdas, con las proporciones de la plantilla', () => {
    const { banda } = montar({})
    const celdas = banda()!.querySelectorAll('.doc-frame__cell')
    expect(celdas.length).toBe(3)
    const [c0, c1, c2] = Array.from(celdas) as HTMLElement[]
    const total = DEFAULT_DOCUMENT_HEADER.columns.reduce((a, b) => a + b, 0)
    expect(parseFloat(c0.style.width)).toBeCloseTo((DEFAULT_DOCUMENT_HEADER.columns[0] / total) * 100, 4)
    expect(parseFloat(c1.style.width)).toBeCloseTo((DEFAULT_DOCUMENT_HEADER.columns[1] / total) * 100, 4)
    expect(parseFloat(c2.style.width)).toBeCloseTo((DEFAULT_DOCUMENT_HEADER.columns[2] / total) * 100, 4)
  })

  it('una fila por campo de la plantilla, con su etiqueta', () => {
    const { banda } = montar({})
    const lineas = banda()!.querySelectorAll('.doc-frame__line')
    expect(lineas.length).toBe(DEFAULT_DOCUMENT_HEADER.rows.length)
    const etiquetas = Array.from(banda()!.querySelectorAll('.doc-frame__label')).map((e) => e.textContent)
    expect(etiquetas).toEqual(DEFAULT_DOCUMENT_HEADER.rows.map((r) => r.label))
  })

  it('sin datos no inventa nada: el hueco se ve como hueco', () => {
    const { banda } = montar({})
    const titulo = banda()!.querySelector('.doc-frame__cell--title') as HTMLElement
    expect(titulo.textContent).toBe('')
    expect(titulo.classList.contains('is-empty')).toBe(true)
    for (const v of banda()!.querySelectorAll('.doc-frame__value')) {
      expect(v.textContent).toBe('—')
      expect(v.classList.contains('is-empty')).toBe(true)
    }
  })

  it('sin logo no deja marca de nadie', () => {
    const { banda } = montar({})
    const celda = banda()!.querySelector('.doc-frame__cell--logo') as HTMLElement
    expect(celda.querySelector('img')).toBeNull()
  })

  it('con logo, lo pone en su celda', () => {
    const tpl = { ...DEFAULT_DOCUMENT_HEADER, enabled: true, logo: 'data:image/png;base64,AAA' }
    const img = montar({ tpl }).banda()!.querySelector('.doc-frame__cell--logo img') as HTMLImageElement
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAA')
  })

  it('apagar la vista borra lo dibujado', () => {
    const { frame, banda } = montar({})
    expect(banda()).not.toBeNull()
    frame.setVisible(false)
    expect(banda()).toBeNull()
  })
})
