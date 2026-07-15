import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type NotificationKind =
  | 'invite_redeemed_diagram'
  | 'invite_redeemed_project'
  | 'comment_mention'

export interface AppNotification {
  id: string
  kind: NotificationKind
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
  createdAt: number
  readAt: number | null
}

interface NotificationRow {
  id: string
  kind: NotificationKind
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
  created_at: string
  read_at: string | null
}

const MAX_ITEMS = 50

function toNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    payload: r.payload ?? {},
    createdAt: Date.parse(r.created_at),
    readAt: r.read_at ? Date.parse(r.read_at) : null,
  }
}

export interface NotificationPrefs {
  emailEnabled: boolean
  inviteEvents: boolean
  mentionEvents: boolean
}

const DEFAULT_PREFS: NotificationPrefs = { emailEnabled: true, inviteEvents: true, mentionEvents: true }

interface NotificationState {
  items: AppNotification[]
  open: boolean
  prefs: NotificationPrefs
  setOpen: (open: boolean) => void
  toggle: () => void
  unreadCount: () => number
  start: (userId: string) => Promise<void>
  stop: () => void
  markRead: (id: string) => void
  markAllRead: () => void
  setPref: (key: keyof NotificationPrefs, value: boolean) => void
}

let channel: RealtimeChannel | null = null

let currentUserId: string | null = null

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  open: false,
  prefs: DEFAULT_PREFS,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  unreadCount: () => get().items.filter((n) => !n.readAt).length,

  start: async (userId) => {
    if (!supabase) return
    get().stop()
    currentUserId = userId

    const [{ data }, { data: prefsRow }] = await Promise.all([
      supabase
        .from('notification_outbox')
        .select('id, kind, payload, created_at, read_at')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_ITEMS),
      supabase
        .from('notification_prefs')
        .select('email_enabled, invite_events, mention_events')
        .eq('user_id', userId)
        .maybeSingle(),
    ])
    set({
      items: ((data ?? []) as NotificationRow[]).map(toNotification),
      prefs: prefsRow
        ? {
            emailEnabled: (prefsRow as { email_enabled: boolean }).email_enabled,
            inviteEvents: (prefsRow as { invite_events: boolean }).invite_events,
            mentionEvents: (prefsRow as { mention_events: boolean }).mention_events,
          }
        : DEFAULT_PREFS,
    })

    const ch = supabase.channel(`notifications:${userId}`)
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notification_outbox', filter: `recipient_id=eq.${userId}` },
      (payload) => {
        const n = toNotification(payload.new as NotificationRow)
        set((s) => ({ items: [n, ...s.items.filter((i) => i.id !== n.id)].slice(0, MAX_ITEMS) }))
      }
    )
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notification_outbox', filter: `recipient_id=eq.${userId}` },
      (payload) => {
        const n = toNotification(payload.new as NotificationRow)
        set((s) => ({ items: s.items.map((i) => (i.id === n.id ? n : i)) }))
      }
    )
    ch.subscribe()
    channel = ch
  },

  stop: () => {
    if (channel && supabase) void supabase.removeChannel(channel)
    channel = null
    currentUserId = null
    set({ items: [], open: false })
  },

  // Optimista: marca ya en el store; el UPDATE va async (RLS acota a lo propio).
  // El builder de supabase-js es lazy → hay que await-earlo (IIFE) o la petición
  // nunca se envía y el read_at no persiste (revierte al recargar).
  markRead: (id) => {
    const target = get().items.find((n) => n.id === id)
    if (!target || target.readAt) return
    const now = Date.now()
    set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, readAt: now } : n)) }))
    void (async () => {
      if (!supabase) return
      const { error } = await supabase
        .from('notification_outbox')
        .update({ read_at: new Date(now).toISOString() })
        .eq('id', id)
      if (error) console.warn('[notif] markRead no persistió:', error)
    })()
  },

  markAllRead: () => {
    const unread = get().items.filter((n) => !n.readAt)
    if (!unread.length) return
    const now = Date.now()
    set((s) => ({ items: s.items.map((n) => (n.readAt ? n : { ...n, readAt: now })) }))
    void (async () => {
      if (!supabase) return
      const { error } = await supabase
        .from('notification_outbox')
        .update({ read_at: new Date(now).toISOString() })
        .in('id', unread.map((n) => n.id))
      if (error) console.warn('[notif] markAllRead no persistió:', error)
    })()
  },

  // Optimista: aplica en el store y hace upsert async (RLS acota a lo propio).
  setPref: (key, value) => {
    set((s) => ({ prefs: { ...s.prefs, [key]: value } }))
    if (!currentUserId) return
    const p = get().prefs
    const uid = currentUserId
    void (async () => {
      if (!supabase) return
      const { error } = await supabase.from('notification_prefs').upsert(
        {
          user_id: uid,
          email_enabled: p.emailEnabled,
          invite_events: p.inviteEvents,
          mention_events: p.mentionEvents,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      if (error) console.warn('[notif] setPref no persistió:', error)
    })()
  },
}))
