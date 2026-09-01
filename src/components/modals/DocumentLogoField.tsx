import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { useImageStore } from '@/store/imageStore'
import { useUIStore } from '@/store/uiStore'
import { ImageThumb } from '@/components/images/ImageThumb'
import { decodeImage, fileToLogoDataUrl } from '@/utils/logoImage'
import { MAX_LOCAL_LOGO_CHARS } from '@/utils/localDocumentHeader'
import type { StoredDocumentHeader } from '@/utils/documentHeader'

/**
 * El logo del cajetín, elegido sin salir de donde se configura el cajetín.
 *
 * POR QUÉ NO ES UN DESPLEGABLE. Antes lo era: una lista con los **nombres** de
 * las imágenes del proyecto. Dos problemas. El primero, que elegir una imagen
 * leyendo nombres no es elegir una imagen — se ve el rótulo, no el logo. El
 * segundo y el que importa: **no había forma de traer un logo nuevo desde aquí**.
 * Había que cerrar el diálogo, abrir la biblioteca, subirlo, volver a exportar y
 * buscarlo en la lista. Cinco pasos para lo que es un arrastre.
 *
 * POR QUÉ NO ABRE LA GALERÍA. La biblioteca de imágenes es un modal, y este
 * panel vive dentro de otro. Un modal sobre otro modal entierra el contexto que
 * se estaba mirando —la hoja— justo cuando se está decidiendo cómo queda. Así
 * que el archivo entra aquí directamente, y las imágenes que ya hay en el
 * proyecto se enseñan **como imágenes**, en una tira, no como una lista de
 * nombres.
 *
 * DOS MODOS, PORQUE HAY DOS SITIOS DONDE PUEDE VIVIR UN LOGO:
 *
 * - **Con proyecto** — el archivo se sube a la biblioteca y la plantilla guarda
 *   una **referencia** (`logoImageId`). Es deliberado: meter el base64 en
 *   `projects.doc_template` es la trampa que PLAN-012 desmontó, y en la
 *   biblioteca ya hay subida, permisos por RLS, borrado y sincronización. Un
 *   logo es además del proyecto entero, que es justo su ámbito. Para no
 *   ensuciar la galería con archivos que no son diagramas, entra en una carpeta
 *   propia que se crea sola la primera vez.
 * - **Sin proyecto** — no hay biblioteca a la que referenciar, porque la
 *   biblioteca es por proyecto. Se guardan los **bytes** (`logoDataUrl`) en el
 *   navegador, y solo el actual: no es una galería, es *este* logo. Ver
 *   `utils/localDocumentHeader.ts`.
 *
 * El control se ve igual en los dos modos salvo en una cosa, y es honesta: sin
 * proyecto no hay tira de imágenes que reutilizar, porque no hay ninguna.
 */

interface Props {
  /** Proyecto de la plantilla, o `null` si el diagrama está suelto. */
  projectId: string | null
  /** Referencia a la biblioteca. Solo con proyecto. */
  imageId: string | null
  /** Bytes del logo. Solo sin proyecto. */
  dataUrl?: string | null
  /** Emite el trozo de plantilla que cambia, no un valor suelto. */
  onChange: (patch: Partial<StoredDocumentHeader>) => void
}

/** Lado por debajo del cual el logo saldrá blando en papel. Ver `dims`. */
const MIN_CRISP_SIDE = 200

export function DocumentLogoField({ projectId, imageId, dataUrl, onChange }: Props) {
  const { t } = useTranslation()
  const images = useImageStore((s) => s.images)
  const folders = useImageStore((s) => s.folders)
  const loaded = useImageStore((s) => s.loaded)
  const loadAll = useImageStore((s) => s.loadAll)
  const upload = useImageStore((s) => s.upload)
  const createFolder = useImageStore((s) => s.createFolder)
  const resolve = useImageStore((s) => s.resolve)
  const addToast = useUIStore((s) => s.addToast)

  const [subiendo, setSubiendo] = useState(false)
  const [encima, setEncima] = useState(false)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Sin proyecto los bytes van en la plantilla; con proyecto, en la biblioteca. */
  const enBiblioteca = Boolean(projectId)

  /**
   * El catálogo se carga aquí si nadie lo ha hecho ya.
   *
   * Antes lo cargaba solo la galería, así que quien abría «Exportar» sin haber
   * pasado nunca por ella veía su propio logo como «no encontrado»: la
   * referencia estaba bien, la lista estaba vacía. Sin proyecto no hace falta:
   * no hay biblioteca que consultar.
   */
  useEffect(() => {
    if (enBiblioteca && !loaded) void loadAll()
  }, [enBiblioteca, loaded, loadAll])

  const elegida = enBiblioteca && imageId ? images.find((i) => i.id === imageId) : undefined
  /**
   * La referencia apunta a algo que ya no está: se dice, no se calla.
   *
   * **Solo con el catálogo cargado.** Mientras carga, una lista vacía no
   * significa que la imagen no exista, y anunciarlo sería mentir durante medio
   * segundo cada vez que se abre el diálogo.
   */
  const huerfana = enBiblioteca && Boolean(imageId) && loaded && !elegida

  /** Hay logo puesto, venga de donde venga. */
  const puesto = enBiblioteca ? Boolean(imageId) && !huerfana : Boolean(dataUrl)

  /** Imágenes del proyecto que se pueden reutilizar, la más reciente primero. */
  const delProyecto = useMemo(
    () => (enBiblioteca ? images.filter((i) => i.projectId === projectId && i.id !== imageId) : []),
    [enBiblioteca, images, projectId, imageId]
  )

  /**
   * El tamaño real del logo, medido al vuelo.
   *
   * No es un dato decorativo: la celda mide ~20 mm, así que por debajo de
   * {@link MIN_CRISP_SIDE} px el logo sale blando **al imprimir**, que es donde
   * ya no se puede arreglar. Decirlo aquí cuesta una línea; descubrirlo en la
   * imprenta cuesta una tirada.
   */
  useEffect(() => {
    let vivo = true
    setDims(null)
    const bytes = enBiblioteca
      ? (imageId ? resolve(imageId) : Promise.resolve(null))
      : Promise.resolve(dataUrl ?? null)
    void bytes
      .then((src) => (src ? decodeImage(src) : null))
      .then((img) => { if (vivo && img) setDims({ w: img.naturalWidth, h: img.naturalHeight }) })
      .catch(() => { /* sin medida: se enseña lo demás y ya */ })
    return () => { vivo = false }
  }, [enBiblioteca, imageId, dataUrl, resolve])

  const importar = useCallback(async (files: FileList | null) => {
    const file = Array.from(files ?? []).find((f) => f.type.startsWith('image/'))
    if (!file) return
    setSubiendo(true)
    try {
      // El mismo preparado en los dos modos: PNG sin pérdida y lado mayor
      // acotado. Lo que cambia es dónde acaban los bytes.
      const png = await fileToLogoDataUrl(file)

      if (!projectId) {
        // Sin proyecto: los bytes van en la plantilla, que vive en el navegador.
        // El tope existe porque `localStorage` es una cuota compartida: pasarse
        // no debe reventar en silencio lo que ya había guardado.
        if (png.length > MAX_LOCAL_LOGO_CHARS) throw new Error(t('modals.export.documentHeader.logoTooBig'))
        onChange({ logoDataUrl: png })
        return
      }

      // La carpeta se crea sola, y solo la primera vez. El logo no es un
      // diagrama escaneado: mezclarlo con ellos convierte la galería en un cajón.
      const nombreCarpeta = t('images.logosFolder')
      const existente = folders.find(
        (f) => f.projectId === projectId && f.name.trim().toLowerCase() === nombreCarpeta.toLowerCase()
      )
      const folderId = existente?.id ?? (await createFolder(nombreCarpeta, projectId))
      const image = await upload({
        dataUrl: png,
        name: file.name.replace(/\.[^.]+$/, ''),
        projectId,
        folderId,
      })
      onChange({ logoImageId: image.id })
    } catch (e) {
      addToast({
        type: 'error',
        title: t('modals.export.documentHeader.logoError'),
        message: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setSubiendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [projectId, folders, createFolder, upload, onChange, addToast, t])

  const quitar = () => onChange(enBiblioteca ? { logoImageId: null } : { logoDataUrl: null })
  const abrirSelector = () => fileRef.current?.click()

  const entrada = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="lgf__file"
      onChange={(e) => void importar(e.target.files)}
    />
  )

  // ── Sin logo: una zona a la que se arrastra ────────────────────────────────
  if (!puesto) {
    return (
      <div className="lgf">
        <button
          type="button"
          className={`lgf__drop ${encima ? 'is-over' : ''}`}
          onClick={abrirSelector}
          disabled={subiendo}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setEncima(true) }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation(); setEncima(false)
            void importar(e.dataTransfer.files)
          }}
        >
          <ImagePlus size={18} className="lgf__dropicon" />
          <span className="lgf__dropmain">
            {subiendo ? t('modals.export.documentHeader.logoUploading') : t('modals.export.documentHeader.logoDrop')}
          </span>
          <span className="lgf__dropsub">{t('modals.export.documentHeader.logoFormats')}</span>
        </button>
        {entrada}
        {huerfana && (
          <p className="lgf__warn">
            {t('modals.export.documentHeader.logoMissing')}{' '}
            <button type="button" className="lgf__link" onClick={quitar}>
              {t('modals.export.documentHeader.logoClear')}
            </button>
          </p>
        )}
        <LibraryStrip images={delProyecto} onPick={(id) => onChange({ logoImageId: id })} />
      </div>
    )
  }

  // Hay referencia y el catálogo aún no ha llegado: se espera en silencio, sin
  // enseñar una zona de arrastre que en un instante va a desaparecer.
  if (enBiblioteca && !elegida) {
    return (
      <div className="lgf">
        <div className="lgf__card lgf__card--wait">{t('modals.export.documentHeader.logoLoading')}</div>
      </div>
    )
  }

  // ── Con logo: lo que hay, y qué se puede hacer con ello ────────────────────
  const blando = dims !== null && Math.max(dims.w, dims.h) < MIN_CRISP_SIDE

  return (
    <div className="lgf">
      <div className="lgf__card">
        {/* Tablero de ajedrez detrás: es lo que distingue un logo con fondo
            transparente de uno con fondo blanco, y ahora que la transparencia
            llega intacta al PDF esa diferencia se ve en la hoja. */}
        <span className="lgf__preview">
          {elegida
            ? <ImageThumb imageId={elegida.id} alt={elegida.name} fit="contain" />
            : <img src={dataUrl!} alt="" className="lgf__previewimg" />}
        </span>
        <span className="lgf__meta">
          {/* Sin biblioteca no hay nombre que enseñar: el logo no es una entrada
              de ningún catálogo. Un rótulo que no rotula nada es ruido, así que
              la identidad la lleva la miniatura y basta. */}
          {elegida && <span className="lgf__name" title={elegida.name}>{elegida.name}</span>}
          <span className={`lgf__dims ${blando ? 'is-warn' : ''}`}>
            {dims
              ? blando
                ? t('modals.export.documentHeader.logoLowRes', { w: dims.w, h: dims.h })
                : `${dims.w} × ${dims.h} px`
              : '…'}
          </span>
        </span>
        <span className="lgf__acts">
          <button
            type="button"
            className="lgf__act"
            onClick={abrirSelector}
            disabled={subiendo}
            title={t('modals.export.documentHeader.logoReplace')}
          >
            <Upload size={13} />
          </button>
          <button
            type="button"
            className="lgf__act"
            onClick={quitar}
            title={t('modals.export.documentHeader.logoClear')}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </div>
      {entrada}
      <LibraryStrip images={delProyecto} onPick={(id) => onChange({ logoImageId: id })} />
    </div>
  )
}

/**
 * Las imágenes que ya tiene el proyecto, **como imágenes**.
 *
 * Existe para no perder lo que hacía el desplegable —reutilizar algo ya subido—
 * sin heredar su defecto: un logo se reconoce mirándolo. Se calla si no hay nada
 * que reutilizar: un proyecto recién creado, o un diagrama suelto, que no tiene
 * biblioteca en absoluto.
 */
function LibraryStrip({
  images, onPick,
}: {
  images: readonly { id: string; name: string }[]
  onPick: (id: string) => void
}) {
  const { t } = useTranslation()
  if (images.length === 0) return null
  return (
    <div className="lgf__lib">
      <span className="lgf__libtitle">{t('modals.export.documentHeader.logoReuse')}</span>
      <div className="lgf__strip">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            className="lgf__chip"
            title={img.name}
            onClick={() => onPick(img.id)}
          >
            <ImageThumb imageId={img.id} alt={img.name} fit="contain" />
          </button>
        ))}
      </div>
    </div>
  )
}
