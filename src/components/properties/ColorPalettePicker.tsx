import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { PALETTE_ROWS, FEATURED_COLORS } from '@/bpmn/elements/colorPalette'

interface ColorPalettePickerProps {
  /** Hex actual, o '' para "sin color". */
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
  /** Color que se muestra en el botón cuando `value` está vacío. */
  noneColor?: string
  'aria-label'?: string
}

/**
 * Selector de color estilo draw.io: un botón que abre un panel con rejilla de
 * muestras. Solo muestras predefinidas — sin rueda HSV ni campos de matiz.
 *
 * El panel se posiciona con `position: fixed` a partir del rect del botón para
 * que no lo recorte el `overflow` del panel de propiedades.
 */
export function ColorPalettePicker({
  value,
  onChange,
  disabled = false,
  noneColor,
  'aria-label': ariaLabel,
}: ColorPalettePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Posicionar bajo el botón, corrigiendo si se sale por abajo o por la derecha.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const pop = popRef.current
    const w = pop?.offsetWidth ?? 232
    const h = pop?.offsetHeight ?? 260
    const M = 8
    let left = r.left
    let top = r.bottom + 6
    if (left + w > window.innerWidth - M) left = window.innerWidth - w - M
    if (top + h > window.innerHeight - M) top = Math.max(M, r.top - h - 6)
    setPos({ top, left })
  }, [open])

  // Cerrar al hacer clic fuera, al pulsar Escape, o al hacer scroll/resize
  // (el panel es `fixed`: quedaría desanclado del botón).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (popRef.current?.contains(tgt) || btnRef.current?.contains(tgt)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus() }
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    // capture: atrapa el scroll de cualquier contenedor, no solo del documento.
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const pick = (hex: string) => { onChange(hex); setOpen(false); btnRef.current?.focus() }
  const swatchColor = value || noneColor || 'var(--group-stroke)'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="color-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={`color-trigger-chip${value ? '' : ' is-none'}`}
          style={{ color: swatchColor }}
        />
        <span className="color-trigger-text">
          {value ? value.toUpperCase() : t('properties.colorPicker.none', 'Sin color')}
        </span>
        <span className="color-trigger-caret" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="color-pop"
          role="dialog"
          aria-label={ariaLabel}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        >
          <div className="color-pop-head">
            <button
              type="button"
              className={`color-none${value ? '' : ' selected'}`}
              onClick={() => pick('')}
            >
              <X size={13} aria-hidden="true" />
              {t('properties.colorPicker.none', 'Sin color')}
            </button>
          </div>

          <div className="color-pop-section">
            {t('properties.colorPicker.featured', 'Sugeridos')}
          </div>
          <div className="color-row">
            {FEATURED_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`color-cell${value.toLowerCase() === hex.toLowerCase() ? ' selected' : ''}`}
                style={{ background: hex }}
                title={hex.toUpperCase()}
                aria-label={hex.toUpperCase()}
                onClick={() => pick(hex)}
              />
            ))}
          </div>

          <div className="color-pop-section">
            {t('properties.colorPicker.all', 'Paleta')}
          </div>
          <div className="color-grid">
            {PALETTE_ROWS.flat().map((hex) => (
              <button
                key={hex}
                type="button"
                className={`color-cell${value.toLowerCase() === hex.toLowerCase() ? ' selected' : ''}`}
                style={{ background: hex }}
                title={hex.toUpperCase()}
                aria-label={hex.toUpperCase()}
                onClick={() => pick(hex)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
