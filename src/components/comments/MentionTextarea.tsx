import { useState, useRef, forwardRef, useImperativeHandle } from 'react'

export interface MentionOption {
  id: string
  label: string
}

interface MentionTextareaProps {
  value: string
  onChange: (text: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  /** Se dispara al insertar una mención desde el dropdown. */
  onMention?: (opt: MentionOption) => void
  options: MentionOption[]
  placeholder?: string
  rows?: number
  className?: string
  style?: React.CSSProperties
}

/** Query de mención activa: texto desde el último `@` de inicio de palabra hasta el caret. */
function detectQuery(text: string, caret: number): string | null {
  const upto = text.slice(0, caret)
  const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(upto)
  return m ? m[1] : null
}

/**
 * Textarea con autocomplete de menciones. Al teclear `@` muestra un dropdown
 * (anclado bajo el textarea) con las opciones filtradas; Enter/Tab/click
 * inserta `@Label ` y notifica via onMention. Sin opciones (modo local) se
 * comporta como un textarea normal.
 */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  function MentionTextarea({ value, onChange, onKeyDown, onMention, options, ...rest }, ref) {
    const innerRef = useRef<HTMLTextAreaElement>(null)
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement)
    const [query, setQuery] = useState<string | null>(null)
    const [highlighted, setHighlighted] = useState(0)

    const filtered = query === null
      ? []
      : options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    const open = query !== null && filtered.length > 0

    const refreshQuery = (text: string) => {
      const caret = innerRef.current?.selectionStart ?? text.length
      const q = detectQuery(text, caret)
      setQuery(q)
      if (q !== null) setHighlighted(0)
    }

    const pick = (opt: MentionOption) => {
      const ta = innerRef.current
      const caret = ta?.selectionStart ?? value.length
      const before = value.slice(0, caret).replace(/@[^\s@]*$/, `@${opt.label} `)
      onChange(before + value.slice(caret))
      onMention?.(opt)
      setQuery(null)
      setTimeout(() => {
        ta?.focus()
        ta?.setSelectionRange(before.length, before.length)
      }, 0)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (open) {
        if (e.key === 'ArrowDown') {
          e.preventDefault(); setHighlighted((h) => (h + 1) % filtered.length); return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault(); setHighlighted((h) => (h - 1 + filtered.length) % filtered.length); return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault(); pick(filtered[highlighted]); return
        }
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation(); setQuery(null); return
        }
      }
      onKeyDown?.(e)
    }

    return (
      <div className="mention-wrap">
        <textarea
          ref={innerRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); refreshQuery(e.target.value) }}
          onKeyDown={handleKeyDown}
          onClick={() => refreshQuery(value)}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
          {...rest}
        />
        {open && (
          <div className="mention-dropdown">
            {filtered.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                className={`mention-item${i === highlighted ? ' active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); pick(opt) }}
                onMouseEnter={() => setHighlighted(i)}
              >
                @{opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
)

/**
 * Menciones seleccionadas que siguen presentes en el texto. `pending` acumula
 * todo lo elegido en el dropdown; se filtra lo que el usuario borró después.
 */
export function activeMentions(text: string, pending: MentionOption[]): string[] {
  return [...new Set(pending.filter((m) => text.includes(`@${m.label}`)).map((m) => m.id))]
}

/** Render de contenido resaltando las `@Label` que correspondan a opciones conocidas. */
export function MentionText({ content, options }: { content: string; options: MentionOption[] }) {
  if (!options.length || !content.includes('@')) return <>{content}</>
  const names = [...options.map((o) => o.label)]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`@(${names.join('|')})`, 'g')
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of content.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push(content.slice(last, idx))
    parts.push(<span key={idx} className="mention">{m[0]}</span>)
    last = idx + m[0].length
  }
  if (last < content.length) parts.push(content.slice(last))
  return <>{parts}</>
}
