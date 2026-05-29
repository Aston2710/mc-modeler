import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { CursorState, ParticipantMeta } from './presence'

interface ChannelHandlers {
  onPresence: (participants: ParticipantMeta[]) => void
  onCursor: (userId: string, cursor: CursorState | null) => void
  /** Fase 5: updates binarios de Yjs (base64) recibidos por broadcast. */
  onYjsUpdate?: (base64: string) => void
}

/**
 * Canal de colaboración por diagrama sobre Supabase Realtime.
 * - Presence: quién está presente (+ su metadata).
 * - Broadcast 'cursor': posición del cursor (coords de diagrama), efímero.
 * - Broadcast 'yjs' (Fase 5): updates del documento CRDT.
 *
 * Reutilizable como transporte de Yjs en la Fase 5.
 */
export class CollabChannel {
  private channel: RealtimeChannel | null = null

  constructor(
    private diagramId: string,
    private me: ParticipantMeta
  ) {}

  connect(handlers: ChannelHandlers): void {
    if (!supabase) return

    const channel = supabase.channel(`diagram:${this.diagramId}`, {
      config: {
        presence: { key: this.me.userId },
        broadcast: { self: false },
      },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<ParticipantMeta>()
      const participants = Object.values(state)
        .map((entries) => entries[0])
        .filter(Boolean)
        .map((e) => ({ userId: e.userId, name: e.name, color: e.color }))
      handlers.onPresence(participants)
    })

    channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      handlers.onCursor(payload.userId as string, (payload.cursor ?? null) as CursorState | null)
    })

    if (handlers.onYjsUpdate) {
      channel.on('broadcast', { event: 'yjs' }, ({ payload }) => {
        handlers.onYjsUpdate?.(payload.update as string)
      })
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track(this.me)
      }
    })

    this.channel = channel
  }

  sendCursor(cursor: CursorState | null): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { userId: this.me.userId, cursor },
    })
  }

  sendYjsUpdate(base64: string): void {
    this.channel?.send({ type: 'broadcast', event: 'yjs', payload: { update: base64 } })
  }

  async disconnect(): Promise<void> {
    if (this.channel && supabase) {
      await supabase.removeChannel(this.channel)
      this.channel = null
    }
  }
}
