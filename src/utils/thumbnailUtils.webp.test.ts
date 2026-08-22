// @vitest-environment jsdom
/**
 * PLAN-012 paso 1 — el thumbnail se rasteriza al guardar.
 *
 * Antes se guardaba el SVG del diagrama entero: 36 kB de mediana, hasta 433 kB,
 * y el navegador tenía que parsear XML y rasterizar el diagrama completo en
 * CADA render de CADA tarjeta. Ahora se rasteriza una vez, al guardar.
 *
 * jsdom no implementa canvas, así que aquí se ejercita sobre todo el camino de
 * respaldo — que es justamente el que no puede fallar: sin él, un entorno sin
 * canvas se quedaría sin thumbnail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/hooks/useExport', () => ({
  getThemedSvg: async (_theme: string, getSvg: () => Promise<string>) => getSvg(),
}))

import {
  buildThumbnail, buildThumbnailSvg, svgToDataUrl, svgToWebp, topPoolCrop,
  thumbTargetBox, sizeSvgForRaster, THUMB_BOX, THUMB_DPR, THUMB_SUPERSAMPLE,
} from './thumbnailUtils'

/**
 * Caja FIJA para las pruebas de comportamiento. Deliberadamente no es la de la
 * app: si lo fuera, cambiar `THUMB_DPR` rompería una docena de aserciones de
 * aritmética que no tienen nada que ver con la densidad elegida. Aquí se
 * comprueba la función; la configuración se comprueba aparte, abajo.
 */
const CAJA = { width: 900, height: 420 }

/** La caja objetivo real de la app, solo para fijar la configuración vigente. */
const BOX = thumbTargetBox()

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#fff"/><text>Tarea</text></svg>'
const getSvg = async () => SVG

afterEach(() => vi.restoreAllMocks())

describe('buildThumbnail', () => {
  it('cae al SVG cuando el entorno no puede rasterizar', async () => {
    // jsdom: getContext('2d') no está implementado → svgToWebp devuelve null.
    const out = await buildThumbnail(getSvg)
    expect(out.startsWith('data:image/svg+xml')).toBe(true)
  })

  it('nunca se queda sin thumbnail aunque el rasterizado lance', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('canvas bloqueado')
    })
    const out = await buildThumbnail(getSvg)
    expect(out.startsWith('data:image/svg+xml')).toBe(true)
  })

  it('conserva el viewBox y el recorte del camino anterior', async () => {
    const crop = { x: 10, y: 20, width: 300, height: 200 }
    const svg = await buildThumbnailSvg(getSvg, () => crop)
    expect(svg).toContain('viewBox="10 20 300 200"')
    expect(svg).toContain('width="300"')
  })

  it('añade viewBox si el SVG no lo traía', async () => {
    const svg = await buildThumbnailSvg(getSvg)
    expect(svg).toContain('viewBox="0 0 800 600"')
  })

  it('ancla el rect de fondo al viewBox real', async () => {
    // Un rect al 100% desde (0,0) no cubre un viewBox que no arranca en el
    // origen — y tras recortar nunca arranca en el origen.
    const svg = await buildThumbnailSvg(getSvg, () => ({ x: 50, y: 50, width: 100, height: 100 }))
    expect(svg).toContain('<rect x="50" y="50" width="100" height="100"')
  })
})

describe('sizeSvgForRaster — de aquí sale la nitidez', () => {
  const svgOf = (w: number, h: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><text>x</text></svg>`

  it('reescribe width/height del SVG al tamaño del ráster', () => {
    // El fallo que esto fija: si el SVG conserva width="250" height="150", el
    // navegador rasteriza el vector a 250×150 y `drawImage` AMPLÍA ese bitmap.
    // El WebP guardado sale borroso, y se ve borroso incluso abriéndolo suelto,
    // porque el defecto está en el fichero.
    const r = sizeSvgForRaster(svgOf(250, 150), CAJA)!
    expect(r.width).toBe(700)
    expect(r.height).toBe(420)
    expect(r.svg).toContain('width="700"')
    expect(r.svg).toContain('height="420"')
    // Y no debe quedar rastro de las medidas de diagrama en la etiqueta raíz.
    expect(r.svg).not.toContain('width="250"')
    expect(r.svg).not.toContain('height="150"')
  })

  it('conserva el viewBox intacto — es lo que mantiene el encuadre', () => {
    const r = sizeSvgForRaster(svgOf(250, 150), CAJA)!
    expect(r.svg).toContain('viewBox="0 0 250 150"')
  })

  it('el tamaño devuelto coincide siempre con los atributos escritos', () => {
    for (const [w, h] of [[250, 150], [2000, 800], [100, 4000], [900, 420], [10000, 50]]) {
      const r = sizeSvgForRaster(svgOf(w, h), CAJA)!
      expect(r.svg).toContain(`width="${r.width}"`)
      expect(r.svg).toContain(`height="${r.height}"`)
    }
  })

  it('no toca el width="100%" del rect de fondo, solo la etiqueta raíz', () => {
    const conRect =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<rect width="100%" height="100%" fill="#fff"/></svg>'
    const r = sizeSvgForRaster(conRect, CAJA)!
    expect(r.svg).toContain('<rect width="100%" height="100%"')
    expect(r.svg).toContain(`width="${r.width}"`)
  })

  it('añade los atributos si el SVG solo traía viewBox', () => {
    const soloViewBox = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"></svg>'
    const r = sizeSvgForRaster(soloViewBox, CAJA)!
    expect(r.width).toBe(840)
    expect(r.height).toBe(420)
    expect(r.svg).toContain('width="840"')
    expect(r.svg).toContain('height="420"')
  })

  it('devuelve null si no hay medidas de las que partir', () => {
    expect(sizeSvgForRaster('<svg xmlns="http://www.w3.org/2000/svg"></svg>', CAJA)).toBe(null)
  })
})

describe('svgToWebp', () => {
  /** Canvas de mentira que registra el lienzo pedido y el rect dibujado. */
  function stubCanvas() {
    const drawn: number[][] = []
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => {},
        drawImage: (_i: unknown, x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]),
      }),
      toDataURL: (mime: string) => `data:${mime};base64,AAAA`,
    }
    vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas as unknown as HTMLElement)
    // La imagen dispara onload en cuanto le asignan src.
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) { queueMicrotask(() => this.onload?.()) }
    }
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
    return { fakeCanvas, drawn }
  }

  const svgOf = (w: number, h: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"></svg>`

  it('devuelve null en lugar de lanzar cuando no hay canvas utilizable', async () => {
    expect(await svgToWebp(SVG, CAJA, 0.92)).toBe(null)
  })

  it('devuelve null si el SVG no declara tamaño', async () => {
    expect(await svgToWebp('<svg xmlns="http://www.w3.org/2000/svg"></svg>', CAJA, 0.92)).toBe(null)
  })

  it('la caja objetivo es la caja CSS por la densidad elegida', () => {
    expect(BOX).toEqual({ width: THUMB_BOX.width * THUMB_DPR, height: THUMB_BOX.height * THUMB_DPR })
    // Configuración vigente, elegida a ojo el 2026-08-22 en el banco del
    // laboratorio. Si cambia THUMB_DPR, esta aserción debe cambiar a mano: es el
    // punto donde la decisión queda registrada, no un detalle de aritmética.
    expect(THUMB_DPR).toBe(4)
    expect(BOX).toEqual({ width: 1200, height: 560 })
  })

  it('reduce un diagrama grande hasta la caja, limitado por el eje que toca antes', async () => {
    const { fakeCanvas, drawn } = stubCanvas()

    // 2000×800 en la caja 900×420: min(900/2000, 420/800) = min(0.45, 0.525)
    // → manda el ancho, escala 0.45 → 900×360.
    const out = await svgToWebp(svgOf(2000, 800), CAJA, 0.92)

    expect(out).toBe('data:image/webp;base64,AAAA')
    expect(fakeCanvas.width).toBe(900)
    expect(fakeCanvas.height).toBe(360)
    expect(drawn[0]).toEqual([0, 0, 900, 360])
  })

  /** Como stubCanvas, pero además captura el Blob entregado al `<img>`. */
  function stubCanvasCapturando() {
    const ctx = {
      fillStyle: '',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      fillRect: () => {},
      drawImage: () => {},
    }
    const fakeCanvas = {
      width: 0, height: 0,
      getContext: () => ctx,
      toDataURL: () => 'data:image/webp;base64,AAAA',
    }
    vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas as unknown as HTMLElement)
    class FakeImage {
      onload: (() => void) | null = null
      set src(_v: string) { queueMicrotask(() => this.onload?.()) }
    }
    vi.stubGlobal('Image', FakeImage)
    const cap: { blob: Blob | null } = { blob: null }
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => { cap.blob = b; return 'blob:x' },
      revokeObjectURL: () => {},
    })
    return { fakeCanvas, ctx, cap }
  }

  it('el SVG que recibe el navegador viene medido en píxeles, no en unidades', async () => {
    // La garantía de punta a punta: lo que se mete en el <img> debe declarar
    // píxeles. Si esto se rompe vuelve el borroso de EXP-017, y las pruebas de
    // lienzo seguirían pasando porque el lienzo sí tenía el tamaño correcto.
    const { cap } = stubCanvasCapturando()
    await svgToWebp(svgOf(250, 150), CAJA, 0.92)

    const texto = await cap.blob!.text()
    expect(texto).not.toContain('width="250"')
    expect(texto).not.toContain('height="150"')
  })

  it('SUPERMUESTREA: pide el SVG al doble del lienzo y reduce', async () => {
    const { fakeCanvas, cap } = stubCanvasCapturando()
    await svgToWebp(svgOf(250, 150), CAJA, 0.92)

    // El lienzo es el tamaño FINAL...
    expect(fakeCanvas.width).toBe(700)
    expect(fakeCanvas.height).toBe(420)
    // ...y el SVG se rasteriza al doble, para promediar al reducir.
    const texto = await cap.blob!.text()
    expect(texto).toContain(`width="${700 * THUMB_SUPERSAMPLE}"`)
    expect(texto).toContain(`height="${420 * THUMB_SUPERSAMPLE}"`)
  })

  it('el múltiplo del supermuestreo es exacto, sin descuadre por redondeo', async () => {
    for (const [w, h] of [[250, 150], [2000, 800], [333, 177], [100, 4000]]) {
      const { fakeCanvas, cap } = stubCanvasCapturando()
      await svgToWebp(svgOf(w, h), CAJA, 0.92)
      const texto = await cap.blob!.text()
      expect(texto).toContain(`width="${fakeCanvas.width * THUMB_SUPERSAMPLE}"`)
      expect(texto).toContain(`height="${fakeCanvas.height * THUMB_SUPERSAMPLE}"`)
      vi.restoreAllMocks()
    }
  })

  it('pide el mejor filtro al reducir — sin él el supermuestreo no sirve de nada', async () => {
    const { ctx } = stubCanvasCapturando()
    await svgToWebp(svgOf(250, 150), CAJA, 0.92)
    expect(ctx.imageSmoothingEnabled).toBe(true)
    expect(ctx.imageSmoothingQuality).toBe('high')
  })

  it('AMPLÍA un diagrama pequeño hasta llenar la caja — el origen es vectorial', async () => {
    const { fakeCanvas } = stubCanvas()

    // El caso que salía borroso: el recorte al pool superior deja un viewBox
    // de ~250×150 unidades de diagrama. Antes se rasterizaba a 250×150 px y el
    // navegador lo ampliaba ~1.9× al pintarlo. min(900/250, 420/150) = 2.8.
    await svgToWebp(svgOf(250, 150), CAJA, 0.92)

    expect(fakeCanvas.width).toBe(700)
    expect(fakeCanvas.height).toBe(420)
  })

  it('nunca excede la caja en ninguno de los dos ejes', async () => {
    for (const [w, h] of [[250, 150], [2000, 800], [100, 4000], [10000, 50], [900, 420]]) {
      const { fakeCanvas } = stubCanvas()
      await svgToWebp(svgOf(w, h), CAJA, 0.92)
      expect(fakeCanvas.width).toBeLessThanOrEqual(CAJA.width)
      expect(fakeCanvas.height).toBeLessThanOrEqual(CAJA.height)
      expect(fakeCanvas.width).toBeGreaterThanOrEqual(1)
      expect(fakeCanvas.height).toBeGreaterThanOrEqual(1)
      vi.restoreAllMocks()
    }
  })

  it('llena la caja en al menos un eje, para no dejar resolución sin usar', async () => {
    for (const [w, h] of [[250, 150], [2000, 800], [100, 4000], [900, 420]]) {
      const { fakeCanvas } = stubCanvas()
      await svgToWebp(svgOf(w, h), CAJA, 0.92)
      const llenaAncho = fakeCanvas.width === CAJA.width
      const llenaAlto = fakeCanvas.height === CAJA.height
      expect(llenaAncho || llenaAlto).toBe(true)
      vi.restoreAllMocks()
    }
  })
})

describe('svgToDataUrl', () => {
  it('escapa el contenido', () => {
    const url = svgToDataUrl('<svg><text>a&b</text></svg>')
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(url).toContain('%26') // el & va escapado
  })
})

describe('topPoolCrop (sin cambios, se conserva)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('devuelve null con menos de 2 pools', () => {
    const registry = { filter: () => [{ x: 0, y: 0, width: 100, height: 50 }] }
    expect(topPoolCrop(registry)).toBe(null)
  })

  it('recorta al pool más alto cuando hay varios', () => {
    const registry = {
      filter: () => [
        { x: 10, y: 200, width: 300, height: 100 },
        { x: 10, y: 40, width: 300, height: 100 },
      ],
    }
    expect(topPoolCrop(registry)).toEqual({ x: 0, y: 30, width: 320, height: 120 })
  })
})
