import * as Y from 'yjs'
import { useCommentStore, type CommentThread, type CommentReply, type Anchor } from '@/store/commentStore'
import { generateId } from '@/utils/idGenerator'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

function yjsMapToThread(ythread: Y.Map<unknown>): CommentThread | null {
  try {
    const id = ythread.get('id') as string
    const anchorStr = ythread.get('anchor') as string
    if (!id || !anchorStr) return null
    const anchor = JSON.parse(anchorStr) as Anchor
    const status = ((ythread.get('status') as string) ?? 'open') as 'open' | 'resolved'
    const orphaned = ((ythread.get('orphaned') as boolean) ?? false)
    const createdBy = ((ythread.get('createdBy') as string) ?? '')
    const createdByName = ((ythread.get('createdByName') as string) ?? 'Usuario')
    const createdAt = ((ythread.get('createdAt') as number) ?? 0)
    const yreplies = ythread.get('replies') as Y.Array<CommentReply> | undefined
    const replies: CommentReply[] = yreplies ? yreplies.toArray() : []
    return { id, anchor, status, orphaned, createdBy, createdByName, createdAt, replies }
  } catch {
    return null
  }
}

export class YjsCommentBinding {
  private doc: Y.Doc
  private ycomments: Y.Map<Y.Map<unknown>>
  private modeler: AnyObj | null = null
  private observer: (() => void) | null = null
  private commandStackHandler: (() => void) | null = null

  constructor(doc: Y.Doc) {
    this.doc = doc
    this.ycomments = doc.getMap('comments') as Y.Map<Y.Map<unknown>>
  }

  start(): void {
    this.observer = () => this.syncToStore()
    this.ycomments.observeDeep(this.observer)
    this.syncToStore()
  }

  attachModeler(modeler: AnyObj): void {
    if (this.modeler === modeler) return
    this.detachModeler()
    this.modeler = modeler
    this.commandStackHandler = () => this.checkOrphans()
    try {
      modeler.get('eventBus').on('commandStack.changed', this.commandStackHandler)
    } catch { /* noop */ }
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
    this.detachModeler()
    if (this.observer) {
      this.ycomments.unobserveDeep(this.observer)
      this.observer = null
    }
  }

  private syncToStore(): void {
    const threads: CommentThread[] = []
    this.ycomments.forEach((ythread) => {
      const t = yjsMapToThread(ythread)
      if (t) threads.push(t)
    })
    threads.sort((a, b) => a.createdAt - b.createdAt)
    useCommentStore.getState().syncFromYjs(threads)
  }

  private checkOrphans(): void {
    if (!this.modeler) return
    try {
      const registry = this.modeler.get('elementRegistry')
      this.ycomments.forEach((ythread) => {
        const anchorStr = ythread.get('anchor') as string
        if (!anchorStr) return
        try {
          const anchor = JSON.parse(anchorStr) as Anchor
          const isOrphaned = ((ythread.get('orphaned') as boolean) ?? false)
          let alive = false
          if (anchor.type === 'element') {
            alive = !!registry.get(anchor.elementId)
          } else {
            // selection: alive while at least one element still exists
            alive = anchor.elementIds.some((id) => !!registry.get(id))
          }
          if (!alive && !isOrphaned) ythread.set('orphaned', true)
          else if (alive && isOrphaned) ythread.set('orphaned', false)
        } catch { /* noop */ }
      })
    } catch { /* noop */ }
  }

  createThread(anchor: Anchor, content: string, userId: string, userName: string): string {
    const id = generateId('ct')
    const ythread = new Y.Map<unknown>()
    const yreplies = new Y.Array<CommentReply>()
    const firstReply: CommentReply = {
      id: generateId('cr'),
      authorId: userId,
      authorName: userName,
      content,
      createdAt: Date.now(),
    }
    this.doc.transact(() => {
      ythread.set('id', id)
      ythread.set('anchor', JSON.stringify(anchor))
      ythread.set('status', 'open')
      ythread.set('orphaned', false)
      ythread.set('createdBy', userId)
      ythread.set('createdByName', userName)
      ythread.set('createdAt', Date.now())
      ythread.set('replies', yreplies)
      yreplies.push([firstReply])
      this.ycomments.set(id, ythread)
    })
    return id
  }

  addReply(threadId: string, content: string, userId: string, userName: string): void {
    const ythread = this.ycomments.get(threadId)
    if (!ythread) return
    const yreplies = ythread.get('replies') as Y.Array<CommentReply> | undefined
    if (!yreplies) return
    const reply: CommentReply = {
      id: generateId('cr'),
      authorId: userId,
      authorName: userName,
      content,
      createdAt: Date.now(),
    }
    yreplies.push([reply])
  }

  deleteThread(threadId: string): void {
    this.ycomments.delete(threadId)
  }

  deleteReply(threadId: string, replyId: string): void {
    const ythread = this.ycomments.get(threadId)
    if (!ythread) return
    const yreplies = ythread.get('replies') as Y.Array<CommentReply> | undefined
    if (!yreplies) return
    const idx = yreplies.toArray().findIndex((r) => r.id === replyId)
    if (idx >= 0) yreplies.delete(idx, 1)
  }

  resolveThread(threadId: string): void {
    this.ycomments.get(threadId)?.set('status', 'resolved')
  }

  reopenThread(threadId: string): void {
    this.ycomments.get(threadId)?.set('status', 'open')
  }
}
