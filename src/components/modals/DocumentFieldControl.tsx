import { useTranslation } from 'react-i18next'
import { fieldSpec } from '@/utils/iso7200'
import { Picker } from '@/components/ui/Picker'
import type { DocumentMeta, DocumentMetaField } from '@/bpmn/elements/documentMeta'

interface ControlProps {
  field: DocumentMetaField
  meta: DocumentMeta
  /** Nombre del diagrama: la sugerencia del título cuando está vacío. */
  diagramName: string
  /** Personas del proyecto. Vacío ⇒ el campo de persona se escribe. */
  people: readonly string[]
  /** Escribe un campo. Sin esto el control es de solo lectura. */
  onEdit?: (field: DocumentMetaField, value: string) => void
}

/**
 * El control adecuado al campo, según el catálogo de ISO 7200.
 *
 * NINGÚN CAMPO DE TEXTO QUE PUEDA NO SERLO. La regla es del usuario y la
 * gobierna `utils/iso7200.ts`: *si la norma fija los valores, son esos; si no
 * los fija, se escribe.* La fecha es un calendario, el estado es la lista
 * cerrada de la norma, una persona se elige del proyecto y la revisión es un
 * contador. Queda escrito solo lo que la norma no fija —el nº de identificación
 * y el título—, porque inventarle una gramática a un código convertiría la
 * herramienta en el formato de una empresa concreta.
 *
 * VIVE EN SU PROPIO MÓDULO, y no dentro del componente que lo usa: un componente
 * declarado dentro de otro es un tipo nuevo en cada render, así que React
 * desmonta y monta su `<input>` en cada tecla y se pierde el foco. Ya pasó una
 * vez y solo se pudo escribir una letra por campo — ver EXP-019.
 */
export function DocumentFieldControl({
  field, meta, diagramName, people, onEdit,
}: ControlProps) {
  const { t } = useTranslation()
  const spec = fieldSpec(field)
  const valor = (meta[field] ?? '').trim()
  const escribir = (v: string) => onEdit?.(field, v)

  if (!spec || !onEdit) {
    return <span className="dfc__ro">{valor || <em>—</em>}</span>
  }

  switch (spec.control) {
    case 'choice':
      return (
        <Picker
          label={t('modals.export.groups.documentHeader')}
          value={valor}
          onChange={escribir}
          placeholder={t('modals.export.documentHeader.none')}
          options={[
            { value: '', label: t('modals.export.documentHeader.none') },
            ...(spec.choices ?? []).map((c) => ({ value: c, label: t(`iso7200.status.${c}`) })),
          ]}
        />
      )

    case 'date':
      return <DateControl value={valor} onChange={escribir} />

    case 'counter':
      return <CounterControl value={valor} onChange={escribir} />

    case 'person':
      // Sin gente conocida no se puede ofrecer una lista, y una lista vacía es
      // peor que un campo: se escribe.
      if (people.length === 0) {
        return <TextControl value={valor} onChange={escribir} />
      }
      return (
        <Picker
          label={t('modals.export.groups.documentHeader')}
          value={valor}
          onChange={escribir}
          placeholder={t('modals.export.documentHeader.none')}
          options={[
            { value: '', label: t('modals.export.documentHeader.none') },
            ...people.map((p) => ({ value: p, label: p })),
          ]}
        />
      )

    default:
      return (
        <TextControl
          value={valor}
          placeholder={spec.auto === 'diagramName' ? diagramName : undefined}
          onChange={escribir}
        />
      )
  }
}

function TextControl({ value, placeholder, onChange }: {
  value: string; placeholder?: string; onChange: (v: string) => void
}) {
  return (
    <input
      className="dfc__in"
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Fecha: el calendario y nada más.
 *
 * **SIN BOTÓN DE «AUTOMÁTICO».** Había uno para copiar la fecha de última
 * modificación, y era un mando de más para lo que debe ser un valor por defecto:
 * la fecha viene puesta —hoy— y quien quiera otra abre el calendario. Un atajo
 * que hay que descubrir no es mejor que un valor sensato ya escrito.
 *
 * `<input type="date">` guarda y devuelve ISO 8601, el único formato sin
 * ambigüedad entre día y mes, y es lo que se guarda en el diagrama. Cómo se
 * presente al imprimir es cosa del dibujado, no del dato.
 */
function DateControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="dfc__in"
      type="date"
      value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Revisión: un contador, no un campo.
 *
 * Se guarda con dos dígitos porque es lo que hace todo el mundo y porque un `1`
 * suelto junto a un `10` ordena mal. No sube de 99: quien llegue ahí tiene un
 * problema que no es de formato.
 */
function CounterControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = /^\d+$/.test(value) ? Number(value) : 0
  const poner = (x: number) => onChange(String(Math.max(0, Math.min(99, x))).padStart(2, '0'))
  return (
    <span className="dfc__counter">
      <button type="button" className="dfc__step" onClick={() => poner(n - 1)} disabled={n <= 0}>−</button>
      <span className="dfc__count">{value || '00'}</span>
      <button type="button" className="dfc__step" onClick={() => poner(n + 1)} disabled={n >= 99}>+</button>
    </span>
  )
}
