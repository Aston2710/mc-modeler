import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ISO7200_FIELDS } from '@/utils/iso7200'
import { fieldName } from '@/i18n/fieldLabels'
import { documentHeaderHeight, type StoredDocumentHeader } from '@/utils/documentHeader'
import { DocumentLogoField } from './DocumentLogoField'
import type { DocumentMetaField } from '@/bpmn/elements/documentMeta'

interface Props {
  stored: StoredDocumentHeader
  /** Proyecto de la plantilla: es donde se guarda el logo que se importe. */
  projectId: string | null
  onPatch: (patch: Partial<StoredDocumentHeader>) => void
  onClose: () => void
  /** Alto útil de la hoja en mm, para decir cuánto se come la cabecera. */
  pageHeight: number
}

/**
 * La plantilla: qué campos lleva la cabecera y con qué logo.
 *
 * **EXISTE HAYA PROYECTO O NO, Y ESO SE CORRIGIÓ.** Antes el panel solo aparecía
 * con proyecto, y un diagrama suelto veía la cabecera a medias: podía rellenar
 * los campos que la plantilla neutra ya traía y nada más — ni logo, ni elegir
 * qué campos salen. Se lo decía con un cartel, *«la cabecera se define en el
 * proyecto»*, que describía bien el código y mal el producto: el estudiante o
 * quien está probando la herramienta son justo quienes no tienen proyecto.
 *
 * Lo único que cambia sin proyecto es **dónde se guarda**: en el navegador en
 * vez de en `projects.doc_template`, y el logo por valor en vez de por
 * referencia, porque la biblioteca de imágenes es por proyecto y no hay ninguna
 * a la que apuntar. Ver `utils/localDocumentHeader.ts`.
 *
 * ESTÁ DETRÁS DE UN BOTÓN a propósito. Se toca una vez —cuando se define el
 * estándar del proyecto— y después no se vuelve a mirar. Tenerla siempre a la
 * vista convertía el diálogo de exportar en un panel de configuración.
 *
 * **POR QUÉ SIGUEN SIENDO CASILLAS.** Son nueve decisiones independientes, y una
 * casilla es el control exacto para eso: se ve el estado de todas a la vez, se
 * cambia una sin tocar las demás y se lee sin abrir nada. Se consideraron dos
 * alternativas y las dos son peores aquí: un multiselector esconde el estado
 * detrás de un clic —justo lo que no interesa en algo que se define una vez—, y
 * unas fichas pulsables ganan compacidad pero pierden la etiqueta de procedencia,
 * que es la que evita que alguien defienda un campo citando una norma que no lo
 * contiene. Lo que faltaba no era otro control: era **decir el precio**.
 *
 * EL PRECIO SE DICE. Cada campo es una línea del recuadro, y el recuadro le quita
 * alto al diagrama. Con nueve campos la cabecera pasa de 18 a ~36 mm, un 17 % de
 * una Carta apaisada. Antes eso no se veía en ninguna parte —y con el alto fijo,
 * las filas se amontonaban unas sobre otras—, así que aquí se dice cuántos campos
 * hay, cuánto mide la cabecera y qué parte de la hoja ocupa.
 *
 * LA PROCEDENCIA DE CADA CAMPO SE DICE. Los de ISO 7200 se marcan como tales y
 * los que no lo son también. Los obligatorios de la norma se señalan, **pero no
 * se imponen**: si alguien quiere una cabecera sin código, la herramienta no está
 * para impedírselo.
 *
 * El título no aparece en la lista porque no es una fila: ocupa la celda central
 * de la cabecera y siempre está.
 */
export function DocumentHeaderTemplatePanel({ stored, projectId, onPatch, onClose, pageHeight }: Props) {
  const { t } = useTranslation()
  const activos = new Set(stored.fields)

  /**
   * Al abrirse se trae a la vista. El panel nace al final de una columna con
   * scroll, que en pantallas normales queda por debajo del borde: sin esto,
   * pulsar el botón parecía no hacer nada.
   */
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const alternar = (field: DocumentMetaField, on: boolean) => {
    // Se conserva el ORDEN DEL CATÁLOGO, no el orden en que se marcaron: así dos
    // proyectos con los mismos campos producen la misma cabecera.
    const siguiente = ISO7200_FIELDS
      .map((f) => f.id)
      .filter((id) => (id === field ? on : activos.has(id)))
    onPatch({ fields: siguiente })
  }

  const deIso = ISO7200_FIELDS.filter((f) => f.iso && f.id !== stored.titleField)
  const fuera = ISO7200_FIELDS.filter((f) => !f.iso)

  /** Lo que cuesta la elección, con la misma función que usa la exportación. */
  const coste = useMemo(() => {
    const alto = documentHeaderHeight({
      ...stored,
      enabled: true,
      logo: null,
      rows: stored.fields.map((field) => ({ field, label: '' })),
    })
    return { alto, parte: pageHeight > 0 ? Math.round((alto / pageHeight) * 100) : 0 }
  }, [stored, pageHeight])

  return (
    <div className="dht" ref={ref}>
      <div className="dht__head">
        {/* El nombre dice dónde vive, porque es la diferencia que importa: una
            la comparte el equipo, la otra no sale de este navegador. */}
        <span>
          {projectId
            ? t('modals.export.documentHeader.template')
            : t('modals.export.documentHeader.templateLocal')}
        </span>
        <button
          type="button"
          className="dht__close"
          onClick={onClose}
          aria-label={t('modals.export.cancel')}
        >
          ✕
        </button>
      </div>
      <p className="dht__help">
        {projectId
          ? t('modals.export.documentHeader.templateHelp')
          : t('modals.export.documentHeader.templateHelpLocal')}
      </p>

      <div className="dht__field">
        <span className="dht__flabel">{t('modals.export.documentHeader.logo')}</span>
        <DocumentLogoField
          projectId={projectId}
          imageId={stored.logoImageId}
          dataUrl={stored.logoDataUrl}
          onChange={onPatch}
        />
      </div>
      {/* Dónde acaban los bytes cambia según haya proyecto o no, y eso el
          usuario tiene que saberlo: uno lo comparte su equipo, el otro vive en
          su navegador y no viaja a ninguna parte. */}
      <p className="dht__help">
        {projectId
          ? t('modals.export.documentHeader.logoHelp')
          : t('modals.export.documentHeader.logoHelpLocal')}
      </p>

      <div className="dht__group">
        <span>{t('modals.export.documentHeader.fieldsOn')}</span>
        {/* El precio de la elección, en la unidad en que se paga: milímetros. */}
        <span className="dht__cost">
          {t('modals.export.documentHeader.cost', {
            count: stored.fields.length,
            mm: coste.alto.toFixed(0),
            part: coste.parte,
          })}
        </span>
      </div>
      <div className="dht__fields">
        {[...deIso, ...fuera].map((f) => (
          <label className="dht__check" key={f.id}>
            <input
              type="checkbox"
              checked={activos.has(f.id)}
              onChange={(e) => alternar(f.id, e.target.checked)}
            />
            <span className="dht__name">{fieldName(f.id)}</span>
            {f.mandatory && <span className="dht__tag dht__tag--iso">{t('iso7200.mandatory')}</span>}
            {!f.iso && <span className="dht__tag">{t('iso7200.notIso')}</span>}
          </label>
        ))}
      </div>
    </div>
  )
}
