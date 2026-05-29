import { create } from 'zustand'
import type { CollaboratorRole } from '@/domain/types'
import { getMyRoles } from '@/lib/sharing'
import { isSupabaseConfigured } from '@/lib/supabase'

interface CollabState {
  rolesByDiagram: Record<string, CollaboratorRole>
  loadRoles: () => Promise<void>
  roleFor: (diagramId: string | null) => CollaboratorRole | null
  /** ¿El usuario puede editar este diagrama? En modo local siempre true. */
  canEdit: (diagramId: string | null) => boolean
  isOwner: (diagramId: string | null) => boolean
}

export const useCollabStore = create<CollabState>((set, get) => ({
  rolesByDiagram: {},

  loadRoles: async () => {
    if (!isSupabaseConfigured) return
    try {
      const roles = await getMyRoles()
      set({ rolesByDiagram: roles })
    } catch {
      // sin sesión todavía / error transitorio
    }
  },

  roleFor: (diagramId) => {
    if (!diagramId) return null
    return get().rolesByDiagram[diagramId] ?? null
  },

  canEdit: (diagramId) => {
    if (!isSupabaseConfigured) return true // modo local: sin permisos
    const role = diagramId ? get().rolesByDiagram[diagramId] : null
    return role === 'owner' || role === 'editor'
  },

  isOwner: (diagramId) => {
    if (!isSupabaseConfigured) return true
    return !!diagramId && get().rolesByDiagram[diagramId] === 'owner'
  },
}))
