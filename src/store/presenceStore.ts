import { create } from 'zustand'
import type { CursorState, Participant, ParticipantMeta } from '@/collab/presence'

interface PresenceState {
  /** Participantes presentes, por userId (incluye al usuario actual). */
  participants: Record<string, Participant>
  setParticipants: (metas: ParticipantMeta[]) => void
  setCursor: (userId: string, cursor: CursorState | null) => void
  reset: () => void
}

export const usePresenceStore = create<PresenceState>((set) => ({
  participants: {},

  setParticipants: (metas) =>
    set((s) => {
      const next: Record<string, Participant> = {}
      for (const m of metas) {
        next[m.userId] = { ...m, cursor: s.participants[m.userId]?.cursor ?? null }
      }
      return { participants: next }
    }),

  setCursor: (userId, cursor) =>
    set((s) => {
      const p = s.participants[userId]
      if (!p) return s
      return { participants: { ...s.participants, [userId]: { ...p, cursor } } }
    }),

  reset: () => set({ participants: {} }),
}))
