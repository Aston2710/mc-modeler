import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { MM_PER_POINT, pageDimensions, placement, type PageSpec } from '@/utils/pageLayout'
import { columnWidths, documentHeaderHeight, LOGO_PADDING, type DocumentHeaderTemplate } from '@/utils/documentHeader'
import { svgViewBox } from '@/utils/pdfDocument'
import type { DocumentMeta } from '@/bpmn/elements/documentMeta'

/**
 * Relleno del banco y sitio de las cotas, en px. Se descuentan del hueco medido
 * para calcular la hoja que **encaja**.
 *
 * OJO: son el reflejo de `.sheet { padding }` y de las cotas en `index.css`. Si
 * cambian allí, cambian aquí, o la hoja se sale del banco.
 */
const BENCH_PAD_X = 24
const BENCH_PAD_Y = 20
const DIM_H_SPACE = 22
const DIM_V_SPACE = 26
/** Por debajo de esto no se dibuja: sería un borrón. */
const SHEET_MIN = 120

/**
 * Píxeles CSS por milímetro **a tamaño real**.
 *
 * Un píxel CSS es 1/96 de pulgada por definición del estándar, así que 100 % es
 * exactamente esto y no una elección estética: es la única escala en la que lo
 * que se ve en pantalla mide lo que medirá el documento. Es lo que permite
 * juzgar la letra de verdad en vez de creerse un número.
 */
const PX_PER_MM = 96 / 25.4

/** Los saltos del zoom. 1 es el tamaño real. */
const PASOS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3]

type Vista = { modo: 'encajar' } | { modo: 'zoom'; factor: number }

/**
 * Mide el hueco libre de un elemento y lo sigue al redimensionar.
 *
 * Se mide un contenedor que **no depende de la hoja** —crece por reparto de flex
 * y recorta lo que sobre—, así que no hay realimentación: la hoja se calcula a
 * partir del hueco, nunca al contrario.
 *
 * Vive fuera del componente por la misma razón que los controles de campo: un
 * hook declarado dentro se recrea en cada render (EXP-019).
 */
function useAvailableBox(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null)
  const [caja, setCaja] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setCaja({ width: el.clientWidth, height: el.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, caja]
}

interface Props {
  /** SVG ya temado: el mismo que se exportará. */
  svg: string
  spec: PageSpec
  tpl: DocumentHeaderTemplate
  meta: DocumentMeta
  /** Nombre del diagrama, para el título cuando el campo está vacío. */
  fallbackTitle: string
}

/**
 * La hoja, acotada como un plano y manejada como un visor (PLAN-034 fase 6).
 *
 * **NO SE EDITA AQUÍ, Y ES EL PUNTO.** Esta vista tiene un solo trabajo: decir la
 * verdad sobre cómo va a quedar el documento. Rellenar los datos en un recuadro
 * de 8 pt exigía apuntar a celdas de tres milímetros y peleaba con la imagen del
 * diagrama por los clics (EXP-019). Los datos se rellenan en el inspector, al
 * lado, con controles de tamaño normal.
 *
 * TRES DECISIONES Y SU MOTIVO:
 *
 * 1. **La hoja se acota**, con las medidas en los márgenes, como un plano
 *    técnico: el tamaño de papel y la zona de dibujo se leen sin leyenda.
 * 2. **Encajar y 100 %.** Encajado se juzga la composición; al 100 % se juzga la
 *    letra, porque un píxel CSS es 1/96 de pulgada y a esa escala lo que se ve
 *    mide lo que medirá. Ampliado, la hoja se arrastra como en cualquier visor.
 * 3. **El texto va en Arial porque es la fuente que usa el PDF.** Que coincidan
 *    no es decoración: es que la previsualización no mienta.
 *
 * Usa la misma aritmética que la exportación (`utils/pageLayout`).
 */
export function DocumentSheet({ svg, spec, tpl, meta, fallbackTitle }: Props) {
  const { t } = useTranslation()
  const [fitRef, hueco] = useAvailableBox()
  const [vista, setVista] = useState<Vista>({ modo: 'encajar' })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const arrastre = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  /**
   * La URL se crea DENTRO del efecto, no en un `useMemo`.
   *
   * Con `useMemo` + revocar en el `useEffect`, StrictMode rompe la imagen: monta
   * el efecto, lo limpia —revocando la URL— y lo vuelve a montar, pero el memo
   * devuelve la misma cadena, que ya está revocada. Resultado: imagen rota en
   * desarrollo y nada que lo explique. Creándola en el efecto, cada montaje
   * tiene la suya.
   */
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [svg])

  const box = useMemo(() => svgViewBox(svg), [svg])
  const page = pageDimensions(spec)
  const place = placement(spec, box.width, box.height)
  const headerH = documentHeaderHeight(tpl)
  const bandW = page.width - spec.margin * 2

  /**
   * La caja de la hoja se calcula en píxeles, no se negocia con el CSS.
   *
   * Antes iba con `aspect-ratio` en línea y no servía de nada: `flex: 1` y
   * `max-height` ganan a la proporción, así que la hoja medía siempre 642×300
   * —ni giraba al pasar a vertical, ni tenía la proporción de Carta— y como todo
   * lo de dentro se posiciona en porcentajes de esa caja, el milímetro
   * horizontal y el vertical tenían escalas distintas: **la previsualización
   * llevaba la geometría distorsionada**.
   */
  const dispW = Math.max(0, hueco.width - BENCH_PAD_X - DIM_V_SPACE)
  const dispH = Math.max(0, hueco.height - BENCH_PAD_Y - DIM_H_SPACE)
  const escalaEncaje = Math.min(dispW / page.width, dispH / page.height)
  const escala = vista.modo === 'encajar' ? escalaEncaje : vista.factor * PX_PER_MM
  const boxW = page.width * escala
  const boxH = page.height * escala
  const cabe = boxW >= SHEET_MIN && boxH >= SHEET_MIN
  const porcentaje = escala > 0 ? Math.round((escala / PX_PER_MM) * 100) : 0

  /** Cuánto se puede arrastrar en cada eje: lo que sobresale, a cada lado. */
  const limite = {
    x: Math.max(0, (boxW + BENCH_PAD_X + DIM_V_SPACE - hueco.width) / 2),
    y: Math.max(0, (boxH + BENCH_PAD_Y + DIM_H_SPACE - hueco.height) / 2),
  }
  const puedeArrastrar = limite.x > 1 || limite.y > 1

  // Al volver a encajar —o al cambiar de hoja— la hoja vuelve al centro: un
  // desplazamiento heredado de otro zoom deja la hoja fuera de la vista.
  useEffect(() => { setPan({ x: 0, y: 0 }) }, [vista, spec.size, spec.orientation])

  const ajustar = (dir: -1 | 1) => {
    const actual = vista.modo === 'encajar' ? escalaEncaje / PX_PER_MM : vista.factor
    const i = PASOS.findIndex((p) => p > actual + 0.001)
    const desde = dir === 1 ? (i === -1 ? PASOS.length - 1 : i) : (i === -1 ? PASOS.length - 1 : i - 1)
    const siguiente = PASOS[Math.max(0, Math.min(PASOS.length - 1, desde))]
    setVista({ modo: 'zoom', factor: siguiente })
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!puedeArrastrar || e.button !== 0) return
    arrastre.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [puedeArrastrar, pan.x, pan.y])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current
    if (!a) return
    setPan({
      x: Math.max(-limite.x, Math.min(limite.x, a.px + (e.clientX - a.x))),
      y: Math.max(-limite.y, Math.min(limite.y, a.py + (e.clientY - a.y))),
    })
  }, [limite.x, limite.y])

  const soltar = useCallback(() => { arrastre.current = null }, [])

  // Todo en porcentaje de la hoja: la vista escala sola al tamaño que le den.
  const px = (mm: number) => `${(mm / page.width) * 100}%`
  const py = (mm: number) => `${(mm / page.height) * 100}%`
  const [w0, w1, w2] = columnWidths(tpl, bandW)
  const titulo = (meta[tpl.titleField] || '').trim()

  /**
   * El texto de la cabecera va al tamaño que tendrá impreso, escalado.
   *
   * Con un tamaño fijo en CSS la banda se desbordaba al pasar a vertical: la
   * hoja encoge, el recuadro encoge y el texto no. Salía «Revisión» cortado por
   * la mitad — una previsualización que enseña un problema que el PDF no tiene
   * es tan inútil como una que esconde uno que sí.
   */
  const bandFontPx = tpl.fontSize * MM_PER_POINT * escala

  return (
    <div className="stage">
      <div className="stage__bar">
        <span className="stage__dims">{page.width.toFixed(1)} × {page.height.toFixed(1)} mm</span>
        <span className="zoom" role="group" aria-label={t('modals.export.sheet.zoom')}>
          <button
            type="button"
            className={`zoom__btn ${vista.modo === 'encajar' ? 'is-on' : ''}`}
            onClick={() => setVista({ modo: 'encajar' })}
          >
            <Maximize2 size={12} />
            {t('modals.export.sheet.fit')}
          </button>
          <button
            type="button"
            className={`zoom__btn ${vista.modo === 'zoom' && vista.factor === 1 ? 'is-on' : ''}`}
            onClick={() => setVista({ modo: 'zoom', factor: 1 })}
            title={t('modals.export.sheet.actualHelp')}
          >
            100 %
          </button>
          <span className="zoom__sep" />
          <button
            type="button"
            className="zoom__step"
            onClick={() => ajustar(-1)}
            aria-label={t('modals.export.sheet.zoomOut')}
          >
            <Minus size={12} />
          </button>
          <span className="zoom__val">{porcentaje} %</span>
          <button
            type="button"
            className="zoom__step"
            onClick={() => ajustar(1)}
            aria-label={t('modals.export.sheet.zoomIn')}
          >
            <Plus size={12} />
          </button>
        </span>
      </div>

      {/* El medidor: crece por reparto de flex y recorta lo que sobre, así que su
          tamaño NO depende de la hoja. De ahí sale el hueco, sin realimentación. */}
      <div
        className={`stage__view ${puedeArrastrar ? 'is-grab' : ''}`}
        ref={fitRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <div
          className="sheet"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            visibility: cabe ? undefined : 'hidden',
          }}
        >
          <div className="sheet__row">
            {/* La cota horizontal va sobre la hoja y con su mismo ancho: una cota
                que no coincide con lo que acota no es una cota. */}
            <div className="sheet__stack" style={{ width: `${boxW}px` }}>
              <div className="sheet__dim sheet__dim--h">
                <span className="sheet__dimline" />
                <span className="sheet__dimval">{page.width.toFixed(1)} mm</span>
                <span className="sheet__dimline" />
              </div>
              <div className="sheet__paper" style={{ width: `${boxW}px`, height: `${boxH}px` }}>
                {/* Guías de margen: se ven, como en un plano */}
                <span
                  className="sheet__guides"
                  style={{
                    left: px(spec.margin), top: py(spec.margin),
                    width: px(bandW), height: py(page.height - spec.margin * 2),
                  }}
                />

                {tpl.enabled && (
                  <div
                    className="sheet__block"
                    style={{
                      left: px(spec.margin), top: py(spec.margin),
                      width: px(bandW), height: py(headerH),
                      fontSize: `${bandFontPx}px`,
                    }}
                  >
                    {/* Sin logo, la celda queda EN BLANCO. Antes decía «sin
                        logo», y un rótulo que anuncia una ausencia elegida es
                        ruido: se ve en la previsualización y no está en el PDF,
                        así que además mentía. */}
                    {/* El aire alrededor del logo es el MISMO que deja `fitLogo`
                        al dibujarlo. Sin descontarlo, la vista lo enseñaba casi
                        un cuarto más grande de lo que sale en la hoja. */}
                    <div
                      className="sheet__cell"
                      style={{ width: `${(w0 / bandW) * 100}%`, padding: `${LOGO_PADDING * escala}px` }}
                    >
                      {tpl.logo && <img src={tpl.logo} alt="" className="sheet__logo" />}
                    </div>
                    <div className="sheet__cell sheet__cell--title" style={{ width: `${(w1 / bandW) * 100}%` }}>
                      <span className="sheet__title">
                        {titulo || <span className="sheet__ph">{fallbackTitle}</span>}
                      </span>
                    </div>
                    <div className="sheet__cell sheet__cell--rows" style={{ width: `${(w2 / bandW) * 100}%` }}>
                      {tpl.rows.map((r) => (
                        <div key={r.field} className="sheet__rowline">
                          <span className="sheet__rowlabel">{r.label}</span>
                          <span className="sheet__rowval">{meta[r.field].trim() || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {url && <img
                  src={url}
                  alt=""
                  className="sheet__diagram"
                  style={
                    spec.rotateDiagram
                      ? {
                          left: px(place.x + (place.width - place.height) / 2),
                          top: py(place.y + (place.height - place.width) / 2),
                          width: px(place.height),
                          height: py(place.width),
                          // +90°, el mismo sentido que `rotateSvgQuarterTurn`: el
                          // flujo baja de arriba abajo. Con −90° subía.
                          transform: 'rotate(90deg)',
                        }
                      : { left: px(place.x), top: py(place.y), width: px(place.width), height: py(place.height) }
                  }
                />}
              </div>
            </div>

            {/* Cota vertical, al lado: el alto de la hoja, y con su mismo alto */}
            <div className="sheet__dim sheet__dim--v" style={{ height: `${boxH}px` }}>
              <span className="sheet__dimline" />
              <span className="sheet__dimval">{page.height.toFixed(1)} mm</span>
              <span className="sheet__dimline" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
