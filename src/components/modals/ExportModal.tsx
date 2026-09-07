import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Settings2, X } from 'lucide-react'
import type { ExportFormat, PngScale, PdfOrientation, ExportTheme } from '@/hooks/useExport'
import { getThemedSvg, resolveThemeName } from '@/hooks/useExport'
import {
  DEFAULT_PAGE_SPEC, PAGE_SIZES, pageDimensions, type PageSizeId, type PageSpec,
} from '@/utils/pageLayout'
import { svgViewBox } from '@/utils/pdfDocument'
import { loadExportPreferences, saveExportPreferences } from '@/utils/exportPreferences'
import {
  DEFAULT_DOCUMENT_HEADER, DEFAULT_STORED_DOCUMENT_HEADER, documentHeaderHeight,
  enableDocumentHeader,
  type DocumentHeaderTemplate, type StoredDocumentHeader,
} from '@/utils/documentHeader'
import { sheetNumber } from '@/utils/iso7200'
import { fieldName } from '@/i18n/fieldLabels'
import { EMPTY_DOCUMENT_META, type DocumentMeta, type DocumentMetaField } from '@/bpmn/elements/documentMeta'
import { DocumentSheet } from './DocumentSheet'
import { DocumentFieldControl } from './DocumentFieldControl'
import { DocumentHeaderTemplatePanel } from './DocumentHeaderTemplatePanel'
import { Picker } from '@/components/ui/Picker'

const THEME_FORMATS: ExportFormat[] = ['png', 'pdf', 'svg']
/** Formatos que producen algo que se ve; el resto son ficheros de datos. */
const VISUAL_FORMATS: ExportFormat[] = ['png', 'svg', 'pdf']

const FORMATS: { id: ExportFormat; ext: string }[] = [
  { id: 'pdf',  ext: '.pdf'  },
  { id: 'png',  ext: '.png'  },
  { id: 'svg',  ext: '.svg'  },
  { id: 'bpmn', ext: '.bpmn' },
  { id: 'bpm',  ext: '.bpm'  },
]

const PREVIEW_BG: Record<string, string> = {
  light: '#ffffff',
  dark:  '#0b0d12',
}

/** Mismo saneado que aplica la exportación: el nombre que se ve es el que sale. */
function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
}

export interface ExportRequest {
  format: ExportFormat
  scale: PngScale
  theme: ExportTheme
  page: PageSpec
  /** Nombre del fichero, sin extensión y ya saneado. */
  fileName: string
  /**
   * Si el documento lleva cabecera. **Es una decisión de esta exportación**, no
   * un dato del proyecto: la plantilla dice *qué* lleva la cabecera —campos y
   * logo—, y esto dice *si* se dibuja.
   */
  includeHeader: boolean
  /**
   * Los datos del documento **tal como los ha compuesto el diálogo**, con sus
   * valores por defecto ya resueltos (la fecha de hoy si no había ninguna). Se
   * mandan en vez de volver a leerlos del lienzo para que el PDF sea exactamente
   * la hoja que se estaba mirando.
   */
  documentMeta: DocumentMeta
}

interface ExportModalProps {
  diagramName: string
  getSvg: () => Promise<string>
  onExport: (req: ExportRequest) => void
  onCancel: () => void
  isExporting: boolean
  /** Plantilla resuelta del proyecto. Sin proyecto, la neutra (apagada). */
  documentHeader?: DocumentHeaderTemplate
  /** La misma plantilla **tal como se guarda**, para poder configurarla. */
  storedHeader?: StoredDocumentHeader
  /** Datos del documento del diagrama. */
  documentMeta?: DocumentMeta
  /** Escribe un campo del documento. Sin esto, la cabecera es de solo lectura. */
  onEditDocumentField?: (field: DocumentMetaField, value: string) => void
  /** Guarda un cambio en la plantilla del proyecto. */
  onSaveTemplate?: (patch: Partial<StoredDocumentHeader>) => void
  /**
   * `false` en solo lectura. **Ya no depende de haber proyecto**: sin él la
   * plantilla vive en el navegador, con el logo por valor
   * (`utils/localDocumentHeader.ts`).
   */
  canConfigureTemplate?: boolean
  /**
   * Proyecto del diagrama, o `null` si está suelto. Decide dónde acaba el logo
   * que se importe: la biblioteca del proyecto, o los bytes en la plantilla.
   */
  projectId?: string | null
  /** Personas del proyecto, para los campos de persona. */
  people?: readonly string[]
}

/**
 * El taller de documento (PLAN-034 fase 6).
 *
 * QUÉ SE REPLANTEÓ Y POR QUÉ. La versión anterior era **una columna de suma
 * cero**: alto fijo y todo apilado en el mismo eje, así que cada bloque que
 * aparecía le quitaba alto a la hoja. Encender la cabecera metía 180 px de
 * editor y la previsualización caía de 745×576 a 490×380 — se hacía pequeño
 * justo lo único que se viene a mirar.
 *
 * La estructura ahora son **dos zonas con trabajos distintos**:
 *
 * - **El escenario** (izquierda) es la hoja, y no encoge nunca. Se encaja o se
 *   ve al 100 % —donde un píxel CSS es 1/96 de pulgada y la letra mide lo que
 *   medirá— y ampliada se arrastra, como en cualquier visor.
 * - **El inspector** (derecha) lleva todo lo que se decide, en secciones
 *   plegables y **con su propio scroll**: añadir campos alarga esa columna, no
 *   estrecha la hoja.
 *
 * Se rellena en un solo sitio: la réplica de la cabecera «a tamaño de trabajo»
 * desaparece. Existía porque la hoja era diminuta y sus celdas de 3 mm no se
 * podían pulsar (EXP-019); con la hoja grande, dos representaciones del mismo
 * objeto solo repartían la atención.
 *
 * Lo que se elige se **recuerda** (`utils/exportPreferences.ts`, navegador) y el
 * nombre del fichero se puede escribir: dos cosas que se pedían a mano cada vez.
 */
export function ExportModal({
  diagramName, getSvg, onExport, onCancel, isExporting,
  documentHeader, storedHeader, documentMeta, onEditDocumentField, onSaveTemplate,
  canConfigureTemplate, people, projectId,
}: ExportModalProps) {
  const { t } = useTranslation()
  // Lo último que se usó. Se lee UNA vez: releerlo en cada render pisaría lo que
  // el usuario acaba de tocar.
  const recordado = useMemo(() => loadExportPreferences(), [])

  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [scale, setScale] = useState<PngScale>(recordado.pngScale ?? 2)
  const [theme, setTheme] = useState<ExportTheme>(recordado.theme ?? 'current')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewSvg, setPreviewSvg] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [configurando, setConfigurando] = useState(false)
  const [fileName, setFileName] = useState(() => safeFileName(diagramName))
  const prevUrlRef = useRef<string | null>(null)

  // Hoja. El valor inicial no es estético: Carta horizontal con márgenes
  // reducidos es lo que más diagramas deja legibles según la medición de los
  // 177 de producción — 49 % frente al 25 % de Carta vertical.
  const plantilla = documentHeader ?? DEFAULT_DOCUMENT_HEADER
  const stored = storedHeader ?? DEFAULT_STORED_DOCUMENT_HEADER
  const metaGuardada = documentMeta ?? EMPTY_DOCUMENT_META

  /**
   * LA FECHA VIENE PUESTA: hoy.
   *
   * Antes había un botón «automático» para copiar la fecha de última
   * modificación. Un mando que hay que descubrir para lo que debe ser un valor
   * por defecto. Ahora, si el campo está vacío, la fecha del documento es la de
   * hoy y quien quiera otra abre el calendario.
   *
   * **No se escribe en el diagrama al abrir el diálogo.** Se resuelve aquí y se
   * manda con la exportación, así que abrir «Exportar» y cancelar no deja el
   * diagrama modificado — y lo que se ve en la hoja es exactamente lo que se
   * dibujará, porque es el mismo objeto.
   */
  const meta = useMemo(() => {
    if (metaGuardada.date?.trim()) return metaGuardada
    return { ...metaGuardada, date: new Date().toISOString().slice(0, 10) }
  }, [metaGuardada])

  /**
   * LA CABECERA NACE APAGADA, y encenderla es una decisión de esta exportación.
   *
   * Antes la casilla escribía `enabled` en la plantilla del **proyecto**, así que
   * quedaba encendida para todo el mundo y para siempre: el diálogo abría con
   * cabecera sin que nadie la hubiera pedido esta vez. La plantilla sigue
   * diciendo *qué* lleva la cabecera —campos y logo, que se definen una vez—;
   * *si* se dibuja lo dice quien exporta, y se recuerda en su navegador.
   */
  const [incluirCabecera, setIncluirCabecera] = useState(recordado.includeHeader ?? false)
  const tpl = useMemo(
    () => enableDocumentHeader(plantilla, incluirCabecera),
    [plantilla, incluirCabecera],
  )
  const [size, setSize] = useState<PageSizeId>(recordado.size ?? DEFAULT_PAGE_SPEC.size)
  const [orientation, setOrientation] = useState<PdfOrientation>(
    recordado.orientation ?? DEFAULT_PAGE_SPEC.orientation,
  )
  const [rotateDiagram, setRotateDiagram] = useState(
    recordado.rotateDiagram ?? DEFAULT_PAGE_SPEC.rotateDiagram,
  )
  const [margin, setMargin] = useState(recordado.margin ?? DEFAULT_PAGE_SPEC.margin)

  /** Secciones abiertas del inspector. También se recuerdan. */
  /**
   * Secciones abiertas del inspector. **La legibilidad nace cerrada**: es un
   * veredicto que se consulta, no una decisión que se toma, y desplegada por
   * defecto empujaba la cabecera fuera de la vista.
   */
  const [abiertas, setAbiertas] = useState<string[]>(
    recordado.openSections ?? ['hoja', 'cabecera', 'imagen'],
  )
  const alternarSeccion = useCallback((id: string) => {
    setAbiertas((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
      saveExportPreferences({ openSections: next })
      return next
    })
  }, [])

  const page: PageSpec = {
    size, orientation, rotateDiagram, margin,
    // El hueco lo decide la plantilla, no quien exporta.
    headerHeight: documentHeaderHeight(tpl),
  }

  const supportsTheme = THEME_FORMATS.includes(format)
  const effectiveTheme: ExportTheme = supportsTheme ? theme : 'current'
  const isVisual = VISUAL_FORMATS.includes(format)
  const esPdf = format === 'pdf'
  const ext = FORMATS.find((f) => f.id === format)?.ext ?? ''

  useEffect(() => {
    let cancelled = false
    setPreviewLoading(true)

    getThemedSvg(effectiveTheme, getSvg)
      .then(svg => {
        if (cancelled) return
        // El SVG en crudo lo necesita la hoja para medir la caja del diagrama
        // con la misma aritmética que la exportación.
        setPreviewSvg(svg)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url  = URL.createObjectURL(blob)
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = url
        setPreviewUrl(url)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPreviewLoading(false) })

    return () => {
      cancelled = true
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = null
      }
    }
  }, [effectiveTheme, getSvg])

  const box = useMemo(() => (previewSvg ? svgViewBox(previewSvg) : null), [previewSvg])
  /**
   * Un diagrama sin nada no se puede exportar: `renderDiagramPdf` lanza «el
   * diagrama no declara tamaño» y salía como error crudo, sin traducir y después
   * de haber pulsado. Se dice antes y se apaga el botón.
   */
  const vacio = Boolean(box) && !(box!.width > 0 && box!.height > 0)
  const previewBg = PREVIEW_BG[resolveThemeName(effectiveTheme)] ?? '#ffffff'
  const puedeConfigurar = Boolean(onSaveTemplate) && canConfigureTemplate !== false
  const abierta = (id: string) => abiertas.includes(id)

  /** Cada cambio se recuerda en el momento: no hay «guardar ajustes». */
  const elegirSize = (v: PageSizeId) => { setSize(v); saveExportPreferences({ size: v }) }
  const elegirOrientacion = (v: PdfOrientation) => {
    setOrientation(v); saveExportPreferences({ orientation: v })
  }
  const elegirMargen = (v: number) => { setMargin(v); saveExportPreferences({ margin: v }) }
  const elegirGiro = (v: boolean) => { setRotateDiagram(v); saveExportPreferences({ rotateDiagram: v }) }
  const elegirTema = (v: ExportTheme) => { setTheme(v); saveExportPreferences({ theme: v }) }
  const elegirEscala = (v: PngScale) => { setScale(v); saveExportPreferences({ pngScale: v }) }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      {/* El alto casi completo existe para que la hoja se lleve el sobrante. En
          `.bpmn` y `.bpm` no hay nada que previsualizar —son ficheros de datos—,
          así que ahí el diálogo se ajusta a lo que dice. */}
      <div
        className={`modal modal--doc ${isVisual ? '' : 'modal--doc-auto'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-headline">
            <div className="modal-title">{t('modals.export.title')}</div>
            <div className="modal-sub">{diagramName}</div>
          </div>

          {/* Qué archivo: la decisión que manda sobre todas las demás, así que
              vive en la cabecera y no en una fila que le robe alto a la hoja. */}
          <div className="exp__formats" role="group" aria-label={t('modals.export.groups.format')}>
            {FORMATS.map(({ id, ext: e }) => (
              <button
                key={id}
                type="button"
                className={`exp__fmt ${format === id ? 'is-on' : ''}`}
                onClick={() => setFormat(id)}
              >
                <span className="exp__fmt-name">{t(`modals.export.formats.${id}.name`)}</span>
                <span className="exp__fmt-ext">{e}</span>
              </button>
            ))}
          </div>

          <button className="icon-btn" onClick={onCancel} aria-label={t('modals.export.cancel')}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {isVisual ? (
            <div className="expw">
              {/* El escenario: la hoja, y nada más. No encoge. */}
              <div className="expw__stage">
                {vacio ? (
                  <div className="expw__wait">{t('modals.export.emptyDiagram')}</div>
                ) : esPdf ? (
                  previewSvg && !previewLoading
                    ? <DocumentSheet svg={previewSvg} spec={page} tpl={tpl} meta={meta} fallbackTitle={diagramName} />
                    : <div className="expw__wait">…</div>
                ) : (
                  <div className="export-preview__box" style={{ background: previewBg }}>
                    {previewLoading
                      ? <span className="export-preview__loading">…</span>
                      : previewUrl
                        ? <img src={previewUrl} alt="" className="export-preview__img" />
                        : <span className="export-preview__loading">—</span>}
                  </div>
                )}
              </div>

              {/* El inspector: todo lo que se decide, con su propio scroll. */}
              <aside className="rail">
                {esPdf && (
                  <Section
                    id="hoja"
                    title={t('modals.export.groups.sheet')}
                    open={abierta('hoja')}
                    onToggle={alternarSeccion}
                  >
                    <Row label={t('modals.export.page.size')}>
                      <Picker
                        label={t('modals.export.page.size')}
                        value={size}
                        onChange={elegirSize}
                        options={Object.values(PAGE_SIZES).map((s) => ({ value: s.id, label: s.label }))}
                      />
                    </Row>
                    <Row label={t('modals.export.options.orientation')}>
                      <Picker
                        label={t('modals.export.options.orientation')}
                        value={orientation}
                        onChange={elegirOrientacion}
                        options={[
                          { value: 'landscape', label: t('modals.export.options.landscape') },
                          { value: 'portrait', label: t('modals.export.options.portrait') },
                        ]}
                      />
                    </Row>
                    <Row label={t('modals.export.page.margin')}>
                      <Picker
                        label={t('modals.export.page.margin')}
                        value={margin}
                        onChange={elegirMargen}
                        options={[
                          { value: 25.4, label: t('modals.export.page.marginWide') },
                          { value: 12.7, label: t('modals.export.page.marginNarrow') },
                          { value: 6, label: t('modals.export.page.marginMin') },
                        ]}
                      />
                    </Row>
                    <Row label={t('modals.export.page.rotate')} help={t('modals.export.page.rotateHelp')}>
                      <label className="f-check">
                        <input
                          type="checkbox"
                          checked={rotateDiagram}
                          onChange={(e) => elegirGiro(e.target.checked)}
                        />
                        <span>{t('modals.export.page.rotateShort')}</span>
                      </label>
                    </Row>
                    <Row label={t('modals.export.groups.theme')}>
                      <ThemePicker theme={theme} onChange={elegirTema} />
                    </Row>
                  </Section>
                )}

                {esPdf && (
                  <Section
                    id="cabecera"
                    title={t('modals.export.groups.documentHeader')}
                    badge={t('iso7200.standard')}
                    open={abierta('cabecera')}
                    onToggle={alternarSeccion}
                  >
                    {puedeConfigurar ? (
                      <label className="f-check rail__switch">
                        <input
                          type="checkbox"
                          checked={incluirCabecera}
                          onChange={(e) => {
                            const on = e.target.checked
                            setIncluirCabecera(on)
                            saveExportPreferences({ includeHeader: on })
                            if (!on) setConfigurando(false)
                          }}
                        />
                        <span>{t('modals.export.documentHeader.include')}</span>
                      </label>
                    ) : (
                      <p className="rail__note">{t('modals.export.documentHeader.readOnly')}</p>
                    )}

                    {tpl.enabled && (
                      <>
                        <Row label={fieldName(tpl.titleField)}>
                          <DocumentFieldControl
                            field={tpl.titleField}
                            meta={meta}
                            diagramName={diagramName}
                            people={people ?? []}
                            onEdit={onEditDocumentField}
                          />
                        </Row>
                        {tpl.rows.map((r) => (
                          <Row key={r.field} label={fieldName(r.field)}>
                            <DocumentFieldControl
                              field={r.field}
                              meta={meta}
                              diagramName={diagramName}
                              people={people ?? []}
                              onEdit={onEditDocumentField}
                            />
                          </Row>
                        ))}
                        {/* El nº de hoja lo exige la norma y lo calcula la
                            herramienta: pedirlo sería pedir que alguien se
                            equivoque escribiéndolo. */}
                        <Row label={t('iso7200.sheetNumber')}>
                          <span className="rail__computed">{sheetNumber()}</span>
                        </Row>

                        {puedeConfigurar && (
                          <button
                            type="button"
                            className="rail__cfg"
                            onClick={() => setConfigurando((v) => !v)}
                          >
                            <Settings2 size={13} />
                            {projectId
                              ? t('modals.export.documentHeader.template')
                              : t('modals.export.documentHeader.templateLocal')}
                          </button>
                        )}
                        {configurando && puedeConfigurar && (
                          <DocumentHeaderTemplatePanel
                            stored={stored}
                            projectId={projectId ?? null}
                            onPatch={(patch) => onSaveTemplate?.(patch)}
                            onClose={() => setConfigurando(false)}
                            pageHeight={pageDimensions(page).height}
                          />
                        )}
                      </>
                    )}
                  </Section>
                )}

                {!esPdf && (
                  <Section
                    id="imagen"
                    title={t('modals.export.groups.raster')}
                    open={abierta('imagen')}
                    onToggle={alternarSeccion}
                  >
                    {format === 'png' && (
                      <Row label={t('modals.export.options.scale')}>
                        <Picker
                          label={t('modals.export.options.scale')}
                          value={scale}
                          onChange={(v) => elegirEscala(v as PngScale)}
                          options={[
                            { value: 1, label: t('modals.export.options.scale1x') },
                            { value: 2, label: t('modals.export.options.scale2x') },
                            { value: 3, label: t('modals.export.options.scale3x') },
                          ]}
                        />
                      </Row>
                    )}
                    <Row label={t('modals.export.groups.theme')}>
                      <ThemePicker theme={theme} onChange={elegirTema} />
                    </Row>
                  </Section>
                )}
              </aside>
            </div>
          ) : (
            <div className="export-facts">
              <div className="export-facts__title">{t(`modals.export.contains.${format}.title`)}</div>
              <div className="export-facts__list">
                {(t(`modals.export.contains.${format}.items`, { returnObjects: true }) as string[]).map(
                  (linea) => <div className="export-facts__item" key={linea}>{linea}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {/* El nombre del fichero se escribe aquí porque es lo último que se
              decide y lo primero que se ve al descargarlo. */}
          <label className="fname">
            <span className="fname__label">{t('modals.export.fileName')}</span>
            <input
              className="fname__in"
              type="text"
              value={fileName}
              onChange={(e) => setFileName(safeFileName(e.target.value))}
              placeholder={safeFileName(diagramName)}
              spellCheck={false}
            />
            <span className="fname__ext">{ext}</span>
          </label>
          <button className="btn-ghost" onClick={onCancel}>{t('modals.export.cancel')}</button>
          <button
            className="btn-primary"
            onClick={() => onExport({
              format,
              scale,
              theme: effectiveTheme,
              page,
              fileName: fileName.trim() || safeFileName(diagramName),
              includeHeader: incluirCabecera,
              documentMeta: meta,
            })}
            disabled={isExporting || (vacio && isVisual)}
            title={vacio && isVisual ? t('modals.export.emptyDiagram') : undefined}
          >
            {isExporting ? '…' : t('modals.export.export')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Una sección del inspector.
 *
 * Plegable y con el estado recordado: quien exporta siempre lo mismo abre el
 * diálogo con sus secciones como las dejó. Vive en el ámbito del módulo, no
 * dentro de `ExportModal`, para no recrear el tipo en cada render (EXP-019).
 */
function Section({ id, title, badge, open, onToggle, children }: {
  id: string
  title: string
  badge?: string
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}) {
  return (
    <section className={`rail__sec ${open ? 'is-open' : ''}`}>
      <button type="button" className="rail__head" onClick={() => onToggle(id)} aria-expanded={open}>
        <ChevronRight size={13} className="rail__chev" />
        <span className="rail__title">{title}</span>
        {badge && <span className="rail__badge">{badge}</span>}
      </button>
      {open && <div className="rail__body">{children}</div>}
    </section>
  )
}

/** Una decisión: su nombre a la izquierda, su mando a la derecha. */
function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="rail__row" title={help}>
      {/* El nombre puede no caber —«Nº de identificación» mide más que la
          columna—, así que se recorta con puntos y se dice entero al posarse. */}
      <span className="rail__label" title={label}>{label}</span>
      <span className="rail__ctl">{children}</span>
    </div>
  )
}

function ThemePicker({ theme, onChange }: { theme: ExportTheme; onChange: (t: ExportTheme) => void }) {
  const { t } = useTranslation()
  return (
    <Picker
      label={t('modals.export.options.theme')}
      value={theme}
      onChange={onChange}
      options={[
        { value: 'current', label: t('modals.export.options.themeCurrent') },
        { value: 'light', label: t('modals.export.options.themeLight') },
        { value: 'dark', label: t('modals.export.options.themeDark') },
      ]}
    />
  )
}
