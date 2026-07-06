import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CommentThread } from '@/store/commentStore'

// ── Mock del cliente Supabase (encadenable) ─────────────────────
const { state } = vi.hoisted(() => ({
  state: {
    threadRows: [] as unknown[],
    replyRows: [] as unknown[],
    inserts: [] as { table: string; values: unknown }[],
    updates: [] as { table: string; values: unknown; id: string }[],
    deletes: [] as { table: string; id: string }[],
    failInserts: false,
    failDeletes: false,
  },
}))

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => ({
    select: () => {
      const rows = table === 'comment_threads' ? state.threadRows : state.replyRows
      const result = Promise.resolve({ data: rows, error: null })
      // Encadenable: .eq() y .order() devuelven el mismo thenable.
      const chain = Object.assign(result, {
        eq: () => chain,
        order: () => chain,
      })
      return chain
    },
    insert: (values: unknown) => {
      if (state.failInserts) return Promise.resolve({ error: { message: 'boom' } })
      state.inserts.push({ table, values })
      return Promise.resolve({ error: null })
    },
    update: (values: unknown) => ({
      eq: (_col: string, id: string) => {
        state.updates.push({ table, values, id })
        return Promise.resolve({ error: null })
      },
    }),
    delete: () => ({
      eq: (_col: string, id: string) => {
        if (state.failDeletes) return Promise.resolve({ error: { message: 'boom' } })
        state.deletes.push({ table, id })
        return Promise.resolve({ error: null })
      },
    }),
  })
  return {
    supabase: {
      from,
      channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
      removeChannel: vi.fn(),
    },
    isSupabaseConfigured: true,
  }
})

import { SupabaseCommentBinding } from './SupabaseCommentBinding'
import { useCommentStore } from '@/store/commentStore'

const threadRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  diagram_id: 'diag-1',
  anchor: { type: 'element', elementId: 'Task_1' },
  status: 'open',
  orphaned: false,
  created_by: 'u1',
  created_by_name: 'Ana',
  created_at: '2026-07-01T10:00:00Z',
  ...over,
})

beforeEach(() => {
  state.threadRows = []
  state.replyRows = []
  state.inserts = []
  state.updates = []
  state.deletes = []
  state.failInserts = false
  state.failDeletes = false
  useCommentStore.setState({ threads: [] } as never)
})

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('SupabaseCommentBinding', () => {
  it('start(): carga hilos+respuestas de las tablas al store, ordenados por fecha', async () => {
    state.threadRows = [
      threadRow('t2', { created_at: '2026-07-02T10:00:00Z' }),
      threadRow('t1', { created_at: '2026-07-01T10:00:00Z' }),
    ]
    state.replyRows = [
      { id: 'r1', thread_id: 't1', author_id: 'u1', author_name: 'Ana', content: 'hola', created_at: '2026-07-01T10:00:00Z' },
    ]
    const b = new SupabaseCommentBinding('diag-1')
    await b.start()
    const threads = useCommentStore.getState().threads
    expect(threads.map((t: CommentThread) => t.id)).toEqual(['t1', 't2'])
    expect(threads[0].replies).toHaveLength(1)
    expect(threads[0].replies[0].content).toBe('hola')
    b.destroy()
  })

  it('createThread: optimista en el store + INSERT de hilo y primera respuesta', async () => {
    const b = new SupabaseCommentBinding('diag-1')
    const id = b.createThread({ type: 'element', elementId: 'Task_1' }, 'primer comentario', 'u1', 'Ana')
    // Optimista: visible de inmediato
    const t = useCommentStore.getState().threads.find((x: CommentThread) => x.id === id)
    expect(t).toBeDefined()
    expect(t!.replies[0].content).toBe('primer comentario')
    await flush()
    expect(state.inserts.map((i) => i.table)).toEqual(['comment_threads', 'comment_replies'])
    b.destroy()
  })

  it('addReply: optimista + INSERT en comment_replies', async () => {
    state.threadRows = [threadRow('t1')]
    const b = new SupabaseCommentBinding('diag-1')
    await b.start()
    b.addReply('t1', 'respuesta', 'u2', 'Beto')
    const t = useCommentStore.getState().threads[0]
    expect(t.replies[t.replies.length - 1].content).toBe('respuesta')
    await flush()
    expect(state.inserts.some((i) => i.table === 'comment_replies')).toBe(true)
    b.destroy()
  })

  it('resolve/reopen: optimista + UPDATE de status', async () => {
    state.threadRows = [threadRow('t1')]
    const b = new SupabaseCommentBinding('diag-1')
    await b.start()
    b.resolveThread('t1')
    expect(useCommentStore.getState().threads[0].status).toBe('resolved')
    b.reopenThread('t1')
    expect(useCommentStore.getState().threads[0].status).toBe('open')
    await flush()
    expect(state.updates).toHaveLength(2)
    expect(state.updates.every((u) => u.id === 't1')).toBe(true)
    b.destroy()
  })

  it('INSERT fallido → refetch revierte el optimismo (la tabla es la verdad)', async () => {
    state.failInserts = true
    const b = new SupabaseCommentBinding('diag-1')
    const id = b.createThread({ type: 'element', elementId: 'Task_1' }, 'x', 'u1', 'Ana')
    expect(useCommentStore.getState().threads.some((t: CommentThread) => t.id === id)).toBe(true)
    await flush()
    await flush()
    // refetch devolvió [] → el hilo optimista desaparece
    expect(useCommentStore.getState().threads).toHaveLength(0)
    b.destroy()
  })

  it('deleteThread: optimista + DELETE en comment_threads', async () => {
    state.threadRows = [threadRow('t1'), threadRow('t2')]
    const b = new SupabaseCommentBinding('diag-1')
    await b.start()
    b.deleteThread('t1')
    expect(useCommentStore.getState().threads.map((t: CommentThread) => t.id)).toEqual(['t2'])
    await flush()
    expect(state.deletes).toEqual([{ table: 'comment_threads', id: 't1' }])
    b.destroy()
  })

  it('deleteReply: optimista + DELETE en comment_replies', async () => {
    state.threadRows = [threadRow('t1')]
    state.replyRows = [
      { id: 'r1', thread_id: 't1', author_id: 'u1', author_name: 'Ana', content: 'cuerpo', created_at: '2026-07-01T10:00:00Z' },
      { id: 'r2', thread_id: 't1', author_id: 'u2', author_name: 'Beto', content: 'respuesta', created_at: '2026-07-01T11:00:00Z' },
    ]
    const b = new SupabaseCommentBinding('diag-1')
    await b.start()
    b.deleteReply('t1', 'r2')
    expect(useCommentStore.getState().threads[0].replies.map((r) => r.id)).toEqual(['r1'])
    await flush()
    expect(state.deletes).toEqual([{ table: 'comment_replies', id: 'r2' }])
    b.destroy()
  })

  it('DELETE fallido → refetch revierte el optimismo', async () => {
    state.threadRows = [threadRow('t1')]
    state.failDeletes = true
    const b = new SupabaseCommentBinding('diag-1')
    await b.start()
    b.deleteThread('t1')
    expect(useCommentStore.getState().threads).toHaveLength(0)
    await flush()
    await flush()
    // refetch devolvió el hilo aún vivo en la tabla → reaparece
    expect(useCommentStore.getState().threads.map((t: CommentThread) => t.id)).toEqual(['t1'])
    b.destroy()
  })

  it('checkOrphans: marca huérfano cuando el anchor no existe y persiste el cambio', async () => {
    state.threadRows = [threadRow('t1')]
    const b = new SupabaseCommentBinding('diag-1')
    await b.start()
    const modeler = {
      get: (svc: string) => {
        if (svc === 'elementRegistry') return { get: () => undefined } // Task_1 ya no existe
        if (svc === 'eventBus') return { on: vi.fn(), off: vi.fn() }
        return undefined
      },
    }
    b.attachModeler(modeler)
    expect(useCommentStore.getState().threads[0].orphaned).toBe(true)
    await flush()
    expect(state.updates.some((u) => (u.values as { orphaned?: boolean }).orphaned === true)).toBe(true)
    b.destroy()
  })
})
