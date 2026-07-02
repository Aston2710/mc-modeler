import { useRef, useState, useEffect, useCallback } from 'react'
import { useCommentStore, getCommentBinding, type CommentThread } from '@/store/commentStore'
import { useAuthStore } from '@/store/authStore'
import { MessageSquare, X, CheckCircle, RotateCcw, Send } from 'lucide-react'

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
  onActivate: () => void
}

function Thread({ thread, isActive, isFocused, userId, userName, onActivate }: ThreadProps) {
  const [replyText, setReplyText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isActive) textareaRef.current?.focus()
  }, [isActive])

  const submit = () => {
    const text = replyText.trim()
    if (!text) return
    getCommentBinding()?.addReply(thread.id, text, userId, userName)
    setReplyText('')
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
            <p className={`cthread-preview${isActive ? ' full' : ''}`}>{first.content}</p>
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
                <p className="creply-content">{reply.content}</p>
              </div>
            </div>
          ))}

          {thread.status === 'open' && (
            <div className="cthread-input-area">
              <textarea
                ref={textareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={onKey}
                placeholder="Responder… (Ctrl+Enter)"
                rows={2}
                className="f-textarea"
                style={{ fontSize: 11, minHeight: 48 }}
              />
              <div className="cthread-actions">
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
            <button
              className="comment-reopen-btn"
              onClick={() => getCommentBinding()?.reopenThread(thread.id)}
            >
              <RotateCcw size={11} /> Reabrir
            </button>
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

interface ComposerProps { userId: string; userName: string }

function NewThreadComposer({ userId, userName }: ComposerProps) {
  const composerAnchor = useCommentStore((s) => s.composerAnchor)
  const closeComposer = useCommentStore((s) => s.closeComposer)
  const setActiveThread = useCommentStore((s) => s.setActiveThread)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composerAnchor) { setText(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [composerAnchor])

  if (!composerAnchor) return null

  const anchorLabel = composerAnchor.elementLabel ??
    (composerAnchor.type === 'element' ? composerAnchor.elementId : 'Selección')

  const submit = () => {
    const content = text.trim()
    if (!content) return
    const id = getCommentBinding()?.createThread(composerAnchor, content, userId, userName)
    if (id) setActiveThread(id)
    closeComposer()
    setText('')
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
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
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
  const { setPanelOpen, setFilter, setActiveThread, togglePanel } = useCommentStore()
  const bodyRef = useRef<HTMLDivElement>(null)
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const user = useAuthStore((s) => s.user)
  const userId = user?.id ?? 'local'
  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    'Usuario'

  const openCount = threads.filter((t) => t.status === 'open').length

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

  return (
    <>
      {/* Toggle button — only visible when panel is closed */}
      {!panelOpen && (
        <button
          className="comment-toggle-btn"
          onClick={togglePanel}
          title="Comentarios (Ctrl+Shift+C)"
        >
          <MessageSquare size={12} />
          {openCount > 0 && (
            <span className="ct-badge">{openCount > 9 ? '9+' : openCount}</span>
          )}
        </button>
      )}

      {/* Panel */}
      {panelOpen && (
        <div className="comments-panel">
          <div className="comments-header">
            <div className="comments-header-left">
              <MessageSquare size={13} />
              Comentarios
              {openCount > 0 && (
                <span className="comments-open-count">{openCount}</span>
              )}
            </div>
            <button className="icon-btn" onClick={() => setPanelOpen(false)}>
              <X size={13} />
            </button>
          </div>

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

          {composerAnchor && <NewThreadComposer userId={userId} userName={userName} />}

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
                    onActivate={() => handleActivate(thread)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
