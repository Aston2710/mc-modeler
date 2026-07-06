import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useCommentStore, type CommentThread, type CommentReply, type Anchor } from '@/store/commentStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

interface ThreadRow {
  id: string
  diagram_id: string
  anchor: Anchor
  status: 'open' | 'resolved'
  orphaned: boolean
  created_by: string | null
  created_by_name: string
  created_at: string
}

interface ReplyRow {
  id: string
  thread_id: string
  author_id: string | null
  author_name: string
  content: string
  created_at: string
}

const REFETCH_DEBOUNCE_MS = 300

/**
 * Comentarios colaborativos sobre tablas Supabase (comment_threads / comment_replies)
 * + Realtime postgres_changes. Reemplaza a YjsCommentBinding en modo colaborativo
 * (ADR persistence-source §6.2a): los comentarios son metadata append-mostly, no
 * necesitan CRDT, y sacarlos del Y.Doc desacopla el pivote "Yjs solo-transporte".
 *
 * Misma interfaz ICommentBinding que consume la UI (CommentsPanel vía
 * getCommentBinding()) → la UI no cambia. Escrituras optimistas: el store se
 * actualiza al instante y el INSERT/UPDATE va async; si falla, se revierte con
 * un refetch (la verdad es la tabla).
 */
export class SupabaseCommentBinding {
  private diagramId: string
  private channel: RealtimeChannel | null = null
  private modeler: AnyObj | null = null
  private commandStackHandler: (() => void) | null = null
  private refetchTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  /** Ids de hilos de ESTE diagrama (para filtrar eventos de replies, que no traen diagram_id). */
  private threadIds = new Set<string>()

  constructor(diagramId: string) {
    this.diagramId = diagramId
  }

  async start(): Promise<void> {
    if (!supabase) return
    await this.refetch()
    if (this.disposed) return

    // Un canal por diagrama. comment_replies no tiene diagram_id → se escucha sin
    // filtro (RLS acota a lo accesible) y se descarta lo que no sea de este diagrama.
    const channel = supabase.channel(`comments:${this.diagramId}`)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comment_threads', filter: `diagram_id=eq.${this.diagramId}` },
      () => this.scheduleRefetch()
    )
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comment_replies' },
      (payload) => {
        const threadId =
          (payload.new as ReplyRow | null)?.thread_id ??
          (payload.old as ReplyRow | null)?.thread_id
        // Sin thread_id (p. ej. DELETE con réplica parcial) → refetch conservador.
        if (!threadId || this.threadIds.has(threadId)) this.scheduleRefetch()
      }
    )
    channel.subscribe()
    this.channel = channel
  }

  attachModeler(modeler: AnyObj): void {
    if (this.modeler === modeler) return
    this.detachModeler()
    this.modeler = modeler
    this.commandStackHandler = () => this.checkOrphans()
    try {
      modeler.get('eventBus').on('commandStack.changed', this.commandStackHandler)
    } catch { /* noop */ }
    this.checkOrphans()
  }

  detachModeler(): void {
    if (this.modeler && this.commandStackHandler) {
      try {
        this.modeler.get('eventBus').off('commandStack.changed', this.commandStackHandler)
      } catch { /* noop */ }
    }
    this.modeler = null
    this.commandStackHandler = null
  }

  destroy(): void {
    this.disposed = true
    this.detachModeler()
    if (this.refetchTimer) { clearTimeout(this.refetchTimer); this.refetchTimer = null }
    if (this.channel && supabase) {
      void supabase.removeChannel(this.channel)
      this.channel = null
    }
  }

  // ── Lectura ──────────────────────────────────────────────────

  private scheduleRefetch(): void {
    if (this.refetchTimer) clearTimeout(this.refetchTimer)
    this.refetchTimer = setTimeout(() => { void this.refetch() }, REFETCH_DEBOUNCE_MS)
  }

  private async refetch(): Promise<void> {
    if (!supabase || this.disposed) return
    const [{ data: threadRows }, { data: replyRows }] = await Promise.all([
      supabase.from('comment_threads').select('*').eq('diagram_id', this.diagramId),
      supabase
        .from('comment_replies')
        .select('*, comment_threads!inner(diagram_id)')
        .eq('comment_threads.diagram_id', this.diagramId)
        .order('created_at', { ascending: true }),
    ])
    if (this.disposed) return

    const repliesByThread = new Map<string, CommentReply[]>()
    for (const r of (replyRows ?? []) as unknown as ReplyRow[]) {
      const list = repliesByThread.get(r.thread_id) ?? []
      list.push({
        id: r.id,
        authorId: r.author_id ?? '',
        authorName: r.author_name,
        content: r.content,
        createdAt: Date.parse(r.created_at),
      })
      repliesByThread.set(r.thread_id, list)
    }

    const threads: CommentThread[] = ((threadRows ?? []) as unknown as ThreadRow[]).map((t) => ({
      id: t.id,
      anchor: t.anchor,
      status: t.status,
      orphaned: t.orphaned,
      createdBy: t.created_by ?? '',
      createdByName: t.created_by_name,
      createdAt: Date.parse(t.created_at),
      replies: repliesByThread.get(t.id) ?? [],
    }))
    threads.sort((a, b) => a.createdAt - b.createdAt)
    this.threadIds = new Set(threads.map((t) => t.id))
    useCommentStore.getState().syncFromYjs(threads)
    this.checkOrphans()
  }

  // ── Escrituras (optimistas) ──────────────────────────────────

  private setThreads(mutate: (threads: CommentThread[]) => CommentThread[]): void {
    const store = useCommentStore.getState()
    store.syncFromYjs(mutate([...store.threads]))
  }

  createThread(anchor: Anchor, content: string, userId: string, userName: string): string {
    const threadId = crypto.randomUUID()
    const replyId = crypto.randomUUID()
    const now = Date.now()
    const thread: CommentThread = {
      id: threadId,
      anchor,
      status: 'open',
      orphaned: false,
      createdBy: userId,
      createdByName: userName,
      createdAt: now,
      replies: [{ id: replyId, authorId: userId, authorName: userName, content, createdAt: now }],
    }
    this.threadIds.add(threadId)
    this.setThreads((ts) => [...ts, thread])

    void (async () => {
      if (!supabase) return
      const { error: e1 } = await supabase.from('comment_threads').insert({
        id: threadId,
        diagram_id: this.diagramId,
        anchor,
        status: 'open',
        orphaned: false,
        created_by: userId,
        created_by_name: userName,
      })
      const { error: e2 } = e1
        ? { error: e1 }
        : await supabase.from('comment_replies').insert({
            id: replyId,
            thread_id: threadId,
            author_id: userId,
            author_name: userName,
            content,
          })
      if (e1 || e2) {
        console.warn('[comments] createThread no persistió, revirtiendo:', e1 ?? e2)
        void this.refetch()
      }
    })()
    return threadId
  }

  addReply(threadId: string, content: string, userId: string, userName: string): void {
    const replyId = crypto.randomUUID()
    const reply: CommentReply = {
      id: replyId,
      authorId: userId,
      authorName: userName,
      content,
      createdAt: Date.now(),
    }
    this.setThreads((ts) =>
      ts.map((t) => (t.id === threadId ? { ...t, replies: [...t.replies, reply] } : t))
    )
    void (async () => {
      if (!supabase) return
      const { error } = await supabase.from('comment_replies').insert({
        id: replyId,
        thread_id: threadId,
        author_id: userId,
        author_name: userName,
        content,
      })
      if (error) {
        console.warn('[comments] addReply no persistió, revirtiendo:', error)
        void this.refetch()
      }
    })()
  }

  deleteThread(threadId: string): void {
    this.threadIds.delete(threadId)
    this.setThreads((ts) => ts.filter((t) => t.id !== threadId))
    void (async () => {
      if (!supabase) return
      // Las replies caen por on delete cascade. RLS: solo el autor puede borrar.
      const { error } = await supabase.from('comment_threads').delete().eq('id', threadId)
      if (error) {
        console.warn('[comments] deleteThread no persistió, revirtiendo:', error)
        void this.refetch()
      }
    })()
  }

  deleteReply(threadId: string, replyId: string): void {
    this.setThreads((ts) =>
      ts.map((t) =>
        t.id === threadId ? { ...t, replies: t.replies.filter((r) => r.id !== replyId) } : t
      )
    )
    void (async () => {
      if (!supabase) return
      const { error } = await supabase.from('comment_replies').delete().eq('id', replyId)
      if (error) {
        console.warn('[comments] deleteReply no persistió, revirtiendo:', error)
        void this.refetch()
      }
    })()
  }

  resolveThread(threadId: string): void {
    this.updateThread(threadId, { status: 'resolved' })
  }

  reopenThread(threadId: string): void {
    this.updateThread(threadId, { status: 'open' })
  }

  private updateThread(threadId: string, patch: Partial<Pick<CommentThread, 'status' | 'orphaned'>>): void {
    this.setThreads((ts) => ts.map((t) => (t.id === threadId ? { ...t, ...patch } : t)))
    void (async () => {
      if (!supabase) return
      const { error } = await supabase.from('comment_threads').update(patch).eq('id', threadId)
      if (error) {
        console.warn('[comments] updateThread no persistió, revirtiendo:', error)
        void this.refetch()
      }
    })()
  }

  // ── Huérfanos (anchor sin elemento en el canvas) ─────────────

  private checkOrphans(): void {
    if (!this.modeler || this.disposed) return
    try {
      const registry = this.modeler.get('elementRegistry')
      for (const t of useCommentStore.getState().threads) {
        let alive = false
        if (t.anchor.type === 'element') {
          alive = !!registry.get(t.anchor.elementId)
        } else {
          alive = t.anchor.elementIds.some((id) => !!registry.get(id))
        }
        const shouldBeOrphaned = !alive
        if (t.orphaned !== shouldBeOrphaned) {
          this.updateThread(t.id, { orphaned: shouldBeOrphaned })
        }
      }
    } catch { /* noop */ }
  }
}
