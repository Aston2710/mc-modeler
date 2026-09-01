import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface PickerOption<T extends string | number> {
  value: T
  label: string
}

interface Props<T extends string | number> {
  value: T
  options: readonly PickerOption<T>[]
  onChange: (value: T) => void
  /** Para lectores de pantalla: el mando no lleva etiqueta visible. */
  label: string
  title?: string
  /** Texto cuando el valor no está en la lista (p. ej. «sin elegir»). */
  placeholder?: string
}

/** Alto de una opción y aire de la lista, en px. Sirve para no salirse de la ventana. */
const ITEM_H = 28
const LIST_PAD = 8
const GAP = 4

/**
 * Un desplegable **de la aplicación**, no del navegador.
 *
 * POR QUÉ NO ES UN `<select>`. Lo era, con la caja dibujada por nosotros y el
 * `select` encima transparente. La lista, en cambio, la dibuja el navegador, y
 * eso trae tres cosas que no se pueden arreglar con CSS:
 *
 * 1. **Se veía en blanco sobre blanco.** El popup toma el color del `select`, y
 *    el nuestro era transparente para no duplicar el texto de la caja.
 * 2. **El resaltado era el azul del sistema**, ajeno a la paleta de la app.
 * 3. **Arrastraba el aspecto del navegador** —sombras y esquinas propias— en
 *    medio de un diálogo con el suyo.
 *
 * Y con `appearance: none` + ancho automático, Firefox calcula además el ancho
 * intrínseco **sin contar el `padding-right`**: la flecha se pintaba encima de la
 * última letra («Cart⌄»).
 *
 * QUÉ SE PIERDE Y CÓMO SE COMPENSA. Un desplegable nativo trae gratis el teclado
 * y la rueda del sistema operativo en un móvil. Aquí el teclado se implementa:
 * `Enter`/`Espacio`/`↓` abren, `↑ ↓ Inicio Fin` mueven, `Enter` elige, `Esc`
 * cierra y devuelve el foco, y la lista es un `listbox` con `aria-activedescendant`
 * para que un lector de pantalla la lea. Esto es un diálogo de escritorio, así
 * que la rueda del móvil no es la pérdida que sería en un formulario público.
 *
 * La lista va en `position: fixed` **a propósito**: dentro del inspector, que
 * tiene `overflow-y: auto`, cualquier popup en flujo quedaría recortado por el
 * borde de la columna.
 */
export function Picker<T extends string | number>({
  value, options, onChange, label, title, placeholder,
}: Props<T>) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [marcado, setMarcado] = useState(0)
  const [caja, setCaja] = useState<{ left: number; top: number; width: number } | null>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const indiceActual = options.findIndex((o) => o.value === value)
  const actual = indiceActual >= 0 ? options[indiceActual] : undefined

  const abrir = useCallback(() => {
    setMarcado(indiceActual >= 0 ? indiceActual : 0)
    setAbierto(true)
  }, [indiceActual])

  const cerrar = useCallback((devolverFoco = true) => {
    setAbierto(false)
    if (devolverFoco) botonRef.current?.focus()
  }, [])

  const elegir = useCallback((i: number) => {
    const o = options[i]
    if (o) onChange(o.value)
    cerrar()
  }, [options, onChange, cerrar])

  /**
   * La posición se mide **antes de pintar** (`useLayoutEffect`), o la lista
   * aparecería un fotograma en la esquina antes de saltar a su sitio. Si no cabe
   * debajo, se abre hacia arriba: es un inspector alto y el último mando queda
   * pegado al borde inferior de la ventana.
   */
  useLayoutEffect(() => {
    if (!abierto) return
    const el = botonRef.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      const alto = Math.min(options.length, 8) * ITEM_H + LIST_PAD
      const debajo = window.innerHeight - r.bottom - GAP
      const arriba = r.top - GAP
      const haciaArriba = debajo < alto && arriba > debajo
      setCaja({
        left: Math.min(r.left, window.innerWidth - r.width - 8),
        top: haciaArriba ? Math.max(8, r.top - GAP - alto) : r.bottom + GAP,
        width: r.width,
      })
    }
    medir()
    // Si la página se mueve bajo la lista, la lista deja de estar donde debe.
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [abierto, options.length])

  /** Pulsar fuera cierra. En captura, para no depender de que nadie pare el clic. */
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (!listaRef.current?.contains(t) && !botonRef.current?.contains(t)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera, true)
    return () => document.removeEventListener('pointerdown', fuera, true)
  }, [abierto])

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierto) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        abrir()
      }
      return
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); cerrar(); break
      case 'Enter':
      case ' ': e.preventDefault(); elegir(marcado); break
      case 'ArrowDown': e.preventDefault(); setMarcado((i) => Math.min(options.length - 1, i + 1)); break
      case 'ArrowUp': e.preventDefault(); setMarcado((i) => Math.max(0, i - 1)); break
      case 'Home': e.preventDefault(); setMarcado(0); break
      case 'End': e.preventDefault(); setMarcado(options.length - 1); break
      case 'Tab': cerrar(false); break
      default: break
    }
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className={`pick ${abierto ? 'is-open' : ''}`}
        title={title}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar(false) : abrir())}
        onKeyDown={teclas}
      >
        <span className={`pick__val ${actual ? '' : 'is-empty'}`}>
          {actual?.label ?? placeholder ?? '—'}
        </span>
        <ChevronDown size={12} className="pick__chev" aria-hidden="true" />
      </button>

      {abierto && caja && (
        <div
          ref={listaRef}
          className="pick__list"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${marcado}`}
          style={{ left: caja.left, top: caja.top, minWidth: caja.width }}
        >
          {options.map((o, i) => (
            <div
              key={String(o.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`pick__opt ${i === marcado ? 'is-marked' : ''} ${o.value === value ? 'is-on' : ''}`}
              onPointerEnter={() => setMarcado(i)}
              onClick={() => elegir(i)}
            >
              <span className="pick__optlabel">{o.label}</span>
              {o.value === value && <Check size={12} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
