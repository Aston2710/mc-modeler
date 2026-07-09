import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type Anchor =
  | { type: 'element';   elementId: string;    elementLabel?: string }
  | { type: 'selection'; elementIds: string[]; elementLabel?: string }

export interface CommentReply {
  id: string
  authorId: string
  authorName: string
  content: string
  createdAt: number
  /** Ids de usuarios etiquetados con @ (solo modo colaborativo). */
  mentions?: string[]
}

export interface CommentThread {
  id: string
  anchor: Anchor
  status: 'open' | 'resolved'
  orphaned: boolean
  createdBy: string
  createdByName: string
  createdAt: number
  replies: CommentReply[]
}

// Structural interface to avoid circular import with YjsCommentBinding
interface ICommentBinding {
  createThread(anchor: Anchor, content: string, userId: string, userName: string, mentions?: string[]): string
  addReply(threadId: string, content: string, userId: string, userName: string, mentions?: string[]): void
  resolveThread(threadId: string): void
  reopenThread(threadId: string): void
  deleteThread(threadId: string): void
  deleteReply(threadId: string, replyId: string): void
}

let _binding: ICommentBinding | null = null
export function setCommentBinding(b: ICommentBinding | null): void { _binding = b }
export function getCommentBinding(): ICommentBinding | null { return _binding }

interface CommentState {
  threads: CommentThread[]
  activeThreadId: string | null
  panelOpen: boolean
  filter: 'all' | 'open' | 'resolved'
  composerAnchor: Anchor | null
  selectedElementId: string | null
  selectedElementIds: string[]

  syncFromYjs: (threads: CommentThread[]) => void
  setActiveThread: (id: string | null) => void
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  setFilter: (f: CommentState['filter']) => void
  openComposer: (anchor: Anchor) => void
  closeComposer: () => void
  setSelectedElementId: (id: string | null) => void
  setSelectedElementIds: (ids: string[]) => void
}

export const useCommentStore = create<CommentState>()(
  immer((set) => ({
    threads: [],
    activeThreadId: null,
    panelOpen: false,
    filter: 'open',
    composerAnchor: null,
    selectedElementId: null,
    selectedElementIds: [],

    syncFromYjs: (threads) => set((s) => { s.threads = threads }),
    setActiveThread: (id) => set((s) => { s.activeThreadId = id }),
    setPanelOpen: (open) => set((s) => { s.panelOpen = open }),
    togglePanel: () => set((s) => { s.panelOpen = !s.panelOpen }),
    setFilter: (f) => set((s) => { s.filter = f }),
    openComposer: (anchor) => set((s) => { s.composerAnchor = anchor }),
    closeComposer: () => set((s) => { s.composerAnchor = null }),
    setSelectedElementId: (id) => set((s) => { s.selectedElementId = id }),
    setSelectedElementIds: (ids) => set((s) => { s.selectedElementIds = ids }),
  }))
)
