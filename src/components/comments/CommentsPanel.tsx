import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useCommentStore, getCommentBinding, type CommentThread } from '@/store/commentStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useDiagramStore } from '@/store/diagramStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { listCollaborators, listProjectCollaborators } from '@/lib/sharing'
import { MentionTextarea, MentionText, activeMentions, type MentionOption } from './MentionTextarea'
import { MessageSquare, X, CheckCircle, RotateCcw, Send, Trash2 } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase()
}

function getBBox(elements: AnyObj[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  elements.forEach((el) => {
    minX = Math.min(minX, el.x); minY = Math.min(minY, el.y)
    maxX = Math.max(maxX, el.x + (el.width ?? 0)); maxY = Math.max(maxY, el.y + (el.height ?? 0))
  })
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function scrollToAnchor(modeler: AnyObj, anchor: import('@/store/commentStore').Anchor) {
  try {
    const registry = modeler.get('elementRegistry')
    const canvas = modeler.get('canvas')
    const sel = modeler.get('selection')
    const padding = { top: 80, bottom: 80, left: 80, right: 320 }
    if (anchor.type === 'element') {
      const el = registry.get(anchor.elementId)
      if (!el) return
      canvas.scrollToElement(el, { padding })
      sel.select(el)
    } else {
      const els = anchor.elementIds.map((id: string) => registry.get(id)).filter(Boolean)
      if (!els.length) return
      sel.select(els)
      const bbox = getBBox(els)
      canvas.scrollToElement({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }, { padding })
    }
  } catch { /* noop */ }
}

// ── Thread card ──────────────────────────────────────────────

interface ThreadProps {
  thread: CommentThread
  isActive: boolean
  isFocused: boolean
  userId: string
  userName: string
  mentionOptions: MentionOption[]
  onActivate: () => void
}

function Thread({ thread, isActive, isFocused, userId, userName, mentionOptions, onActivate }: ThreadProps) {
  const [replyText, setReplyText] = useState('')
  // Todo lo elegido en el dropdown de @; al enviar se filtra lo aún presente en el texto.
  const [pendingMentions, setPendingMentions] = useState<MentionOption[]>([])
  // 'thread' = borrar hilo completo; otro valor = id de la reply a borrar
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isActive) textareaRef.current?.focus()
    else setConfirmDelete(null)
  }, [isActive])

  const submit = () => {
    const text = replyText.trim()
    if (!text) return
    getCommentBinding()?.addReply(thread.id, text, userId, userName, activeMentions(text, pendingMentions))
    setReplyText('')
    setPendingMentions([])
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() }
  }

  const first = thread.replies[0]
  const cls = [
    'cthread',
    isActive ? 'active' : '',
    isFocused ? 'element-focused' : '',
    thread.orphaned ? 'orphaned' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} onClick={onActivate}>
      {thread.anchor.elementLabel && (
        <p className="cthread-element-lbl">{thread.anchor.elementLabel}</p>
      )}
      <div className="cthread-head">
        <div className="cthread-avatar">{initials(thread.createdByName || 'U')}</div>
        <div className="cthread-meta">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="cthread-author">{thread.createdByName || 'Usuario'}</span>
            <span className="cthread-time">{relativeTime(thread.createdAt)}</span>
          </div>
          {first && (
            <p className={`cthread-preview${isActive ? ' full' : ''}`}>
              <MentionText content={first.content} options={mentionOptions} />
            </p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
          {thread.status === 'resolved' && (
            <span className="cthread-badge cthread-badge--resolved">Resuelto</span>
          )}
          {thread.orphaned && (
            <span className="cthread-badge cthread-badge--orphaned">Eliminado</span>
          )}
        </div>
      </div>

      {isActive && (
        <div className="cthread-body" onClick={(e) => e.stopPropagation()}>
          {thread.replies.slice(1).map((reply) => (
            <div key={reply.id} className="creply-row">
              <div className="creply-avatar">{initials(reply.authorName || 'U')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className="creply-author">{reply.authorName}</span>
                  <span className="creply-time">{relativeTime(reply.createdAt)}</span>
                </div>
                <p className="creply-content">
                  <MentionText content={reply.content} options={mentionOptions} />
                </p>
              </div>
              {reply.authorId === userId && (
                confirmDelete === reply.id ? (
                  <span className="cdelete-confirm">
                    <button
                      className="cdelete-yes"
                      onClick={() => {
                        getCommentBinding()?.deleteReply(thread.id, reply.id)
                        setConfirmDelete(null)
                      }}
                    >
                      Sí
                    </button>
                    <button className="cdelete-no" onClick={() => setConfirmDelete(null)}>No</button>
                  </span>
                ) : (
                  <button
                    className="comment-delete-btn comment-delete-btn--reply"
                    title="Eliminar respuesta"
                    onClick={() => setConfirmDelete(reply.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                )
              )}
            </div>
          ))}

          {thread.status === 'open' && (
            <div className="cthread-input-area">
              <MentionTextarea
                ref={textareaRef}
                value={replyText}
                onChange={setReplyText}
                onKeyDown={onKey}
                onMention={(o) => setPendingMentions((ms) => [...ms, o])}
                options={mentionOptions.filter((o) => o.id !== userId)}
                placeholder="Responder… (Ctrl+Enter)"
                rows={2}
                className="f-textarea"
                style={{ fontSize: 11, minHeight: 48 }}
              />
              <div className="cthread-actions">
                {thread.createdBy === userId && (
                  confirmDelete === 'thread' ? (
                    <span className="cdelete-confirm">
                      ¿Eliminar hilo?
                      <button
                        className="cdelete-yes"
                        onClick={() => getCommentBinding()?.deleteThread(thread.id)}
                      >
                        Sí
                      </button>
                      <button className="cdelete-no" onClick={() => setConfirmDelete(null)}>No</button>
                    </span>
                  ) : (
                    <button
                      className="comment-delete-btn"
                      title="Eliminar hilo"
                      onClick={() => setConfirmDelete('thread')}
                    >
                      <Trash2 size={11} /> Eliminar
                    </button>
                  )
                )}
                <button
                  className="comment-resolve-btn"
                  onClick={() => getCommentBinding()?.resolveThread(thread.id)}
                >
                  <CheckCircle size={11} /> Resolver
                </button>
                <button
                  className="btn-primary-sm"
                  onClick={submit}
                  disabled={!replyText.trim()}
                >
                  <Send size={9} /> Enviar
                </button>
              </div>
            </div>
          )}

          {thread.status === 'resolved' && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                className="comment-reopen-btn"
                onClick={() => getCommentBinding()?.reopenThread(thread.id)}
              >
                <RotateCcw size={11} /> Reabrir
              </button>
              {thread.createdBy === userId && (
                confirmDelete === 'thread' ? (
                  <span className="cdelete-confirm">
                    ¿Eliminar hilo?
                    <button
                      className="cdelete-yes"
                      onClick={() => getCommentBinding()?.deleteThread(thread.id)}
                    >
                      Sí
                    </button>
                    <button className="cdelete-no" onClick={() => setConfirmDelete(null)}>No</button>
                  </span>
                ) : (
                  <button
                    className="comment-delete-btn"
                    title="Eliminar hilo"
                    onClick={() => setConfirmDelete('thread')}
                  >
                    <Trash2 size={11} /> Eliminar
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}

      {!isActive && thread.replies.length > 1 && (
        <p className="cthread-reply-count">{thread.replies.length} respuestas</p>
      )}
    </div>
  )
}

// ── Composer ────────────────────────────────────────────────

interface ComposerProps { userId: string; userName: string; mentionOptions: MentionOption[] }

function NewThreadComposer({ userId, userName, mentionOptions }: ComposerProps) {
  const composerAnchor = useCommentStore((s) => s.composerAnchor)
  const closeComposer = useCommentStore((s) => s.closeComposer)
  const setActiveThread = useCommentStore((s) => s.setActiveThread)
  const [text, setText] = useState('')
  const [pendingMentions, setPendingMentions] = useState<MentionOption[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composerAnchor) {
      setText('')
      setPendingMentions([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [composerAnchor])

  if (!composerAnchor) return null

  const anchorLabel = composerAnchor.elementLabel ??
    (composerAnchor.type === 'element' ? composerAnchor.elementId : 'Selección')

  const submit = () => {
    const content = text.trim()
    if (!content) return
    const id = getCommentBinding()?.createThread(
      composerAnchor, content, userId, userName, activeMentions(content, pendingMentions)
    )
    if (id) setActiveThread(id)
    closeComposer()
    setText('')
    setPendingMentions([])
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit() }
    if (e.key === 'Escape') closeComposer()
  }

  return (
    <div className="comment-composer">
      <div className="comment-composer-hd">
        <span className="comment-composer-title">Nuevo comentario</span>
        <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={closeComposer}>
          <X size={12} />
        </button>
      </div>
      <p className="comment-anchor-lbl">{anchorLabel}</p>
      <MentionTextarea
        ref={inputRef}
        value={text}
        onChange={setText}
        onKeyDown={onKey}
        onMention={(o) => setPendingMentions((ms) => [...ms, o])}
        options={mentionOptions.filter((o) => o.id !== userId)}
        placeholder="Escribe un comentario… (Ctrl+Enter)"
        rows={3}
        className="f-textarea"
        style={{ fontSize: 11, minHeight: 58 }}
      />
      <div className="comment-composer-actions">
        <button className="btn-ghost-sm" onClick={closeComposer}>Cancelar</button>
        <button className="btn-primary-sm" onClick={submit} disabled={!text.trim()}>
          <Send size={9} /> Comentar
        </button>
      </div>
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────

interface CommentsPanelProps {
  modelerRef: React.RefObject<AnyObj>
}

export function CommentsPanel({ modelerRef }: CommentsPanelProps) {
  const threads = useCommentStore((s) => s.threads)
  const panelOpen = useCommentStore((s) => s.panelOpen)
  const filter = useCommentStore((s) => s.filter)
  const activeThreadId = useCommentStore((s) => s.activeThreadId)
  const composerAnchor = useCommentStore((s) => s.composerAnchor)
  const selectedElementId = useCommentStore((s) => s.selectedElementId)
  const { setFilter, setActiveThread, togglePanel } = useCommentStore()
  const rightPanelExpanded = useUIStore((s) => s.propertiesPanelOpen)
  const bodyRef = useRef<HTMLDivElement>(null)
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Slot del RightPanel donde se porta este contenido. Se busca post-commit:
  // el slot y este componente reaccionan al mismo panelOpen, y los effects
  // corren cuando el DOM del RightPanel ya está actualizado.
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setSlot(panelOpen ? document.getElementById('comments-panel-slot') : null)
  }, [panelOpen, rightPanelExpanded])

  const user = useAuthStore((s) => s.user)
  const userId = user?.id ?? 'local'
  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    'Usuario'

  // Colaboradores del diagrama (+ los del proyecto, si pertenece a uno) para
  // el autocomplete de menciones y el resaltado. Solo en modo colaborativo.
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const [mentionOptions, setMentionOptions] = useState<MentionOption[]>([])
  useEffect(() => {
    if (!panelOpen || !isSupabaseConfigured || !user || !activeTabId) {
      setMentionOptions([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const collabs = await listCollaborators(activeTabId)
        const projectId = useDiagramStore.getState().diagrams.find((d) => d.id === activeTabId)?.projectId
        const projCollabs = projectId ? await listProjectCollaborators(projectId) : []
        if (cancelled) return
        const seen = new Set<string>()
        const opts: MentionOption[] = []
        for (const c of [...collabs, ...projCollabs]) {
          if (seen.has(c.userId)) continue
          seen.add(c.userId)
          opts.push({ id: c.userId, label: c.displayName || c.email || 'Usuario' })
        }
        setMentionOptions(opts)
      } catch { /* sin lista de colaboradores → sin autocomplete */ }
    })()
    return () => { cancelled = true }
  }, [panelOpen, user, activeTabId])

  const visible = threads.filter((t) => {
    if (filter === 'open') return t.status === 'open'
    if (filter === 'resolved') return t.status === 'resolved'
    return true
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') { e.preventDefault(); togglePanel() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [togglePanel])

  // Scroll panel to active thread
  useEffect(() => {
    if (!activeThreadId) return
    const el = threadRefs.current[activeThreadId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeThreadId])

  // When selected element changes and has threads, scroll panel to first matching thread
  useEffect(() => {
    if (!selectedElementId || !panelOpen) return
    const match = visible.find((t) => t.anchor.type === 'element' && t.anchor.elementId === selectedElementId)
    if (!match) return
    const el = threadRefs.current[match.id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedElementId, panelOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleActivate = useCallback((thread: CommentThread) => {
    const next = thread.id === activeThreadId ? null : thread.id
    setActiveThread(next)
    if (next && modelerRef.current) {
      scrollToAnchor(modelerRef.current, thread.anchor)
    }
  }, [activeThreadId, setActiveThread, modelerRef])

  // El shell (pestañas de modo, header, colapso) es del RightPanel; aquí solo
  // el contenido, portado a su slot. Sin slot (barra colapsada o cambiando de
  // modo) no se renderiza nada — el atajo Ctrl+Shift+C sigue vivo arriba.
  if (!panelOpen || !slot) return null

  return createPortal(
    <>
          <div className="comments-tabs">
            {(['open', 'resolved', 'all'] as const).map((f) => (
              <button
                key={f}
                className={`comments-tab${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'open' ? 'Abiertos' : f === 'resolved' ? 'Resueltos' : 'Todos'}
              </button>
            ))}
          </div>

          {composerAnchor && (
            <NewThreadComposer userId={userId} userName={userName} mentionOptions={mentionOptions} />
          )}

          <div className="comments-body" ref={bodyRef}>
            {visible.length === 0 ? (
              <div className="comments-empty">
                <MessageSquare size={24} style={{ opacity: 0.2 }} />
                <span style={{ fontSize: 12 }}>
                  {filter === 'open'
                    ? 'No hay comentarios abiertos.'
                    : filter === 'resolved'
                      ? 'No hay comentarios resueltos.'
                      : 'Aún no hay comentarios.'}
                </span>
                {!composerAnchor && (
                  <span className="comments-empty-hint">
                    Usa el ícono de comentario en cualquier elemento del diagrama.
                  </span>
                )}
              </div>
            ) : (
              visible.map((thread) => (
                <div
                  key={thread.id}
                  ref={(el) => { threadRefs.current[thread.id] = el }}
                >
                  <Thread
                    thread={thread}
                    isActive={thread.id === activeThreadId}
                    isFocused={thread.anchor.type === 'element' && thread.anchor.elementId === selectedElementId}
                    userId={userId}
                    userName={userName}
                    mentionOptions={mentionOptions}
                    onActivate={() => handleActivate(thread)}
                  />
                </div>
              ))
            )}
          </div>
    </>,
    slot
  )
}
