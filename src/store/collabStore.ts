import { create } from 'zustand'
import type { CollaboratorRole } from '@/domain/types'
import { getMyRoles, getMyProjectRoles } from '@/lib/sharing'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useDiagramStore } from '@/store/diagramStore'

/** Jerarquía de roles para comparar el más permisivo. */
const RANK: Record<CollaboratorRole, number> = { viewer: 1, editor: 2, owner: 3 }

interface CollabState {
  rolesByDiagram: Record<string, CollaboratorRole>
  rolesByProject: Record<string, CollaboratorRole>
  loadRoles: () => Promise<void>
  /** Rol efectivo en un diagrama: el más permisivo entre su rol directo y el heredado del proyecto. */
  roleFor: (diagramId: string | null) => CollaboratorRole | null
  /** ¿El usuario puede editar este diagrama? En modo local siempre true. */
  canEdit: (diagramId: string | null) => boolean
  isOwner: (diagramId: string | null) => boolean
}

function projectRoleForDiagram(
  diagramId: string,
  rolesByProject: Record<string, CollaboratorRole>
): CollaboratorRole | null {
  const diagram = useDiagramStore.getState().diagrams.find((d) => d.id === diagramId)
  if (!diagram?.projectId) return null
  return rolesByProject[diagram.projectId] ?? null
}

function effectiveRole(
  diagramId: string,
  rolesByDiagram: Record<string, CollaboratorRole>,
  rolesByProject: Record<string, CollaboratorRole>
): CollaboratorRole | null {
  const direct = rolesByDiagram[diagramId] ?? null
  const inherited = projectRoleForDiagram(diagramId, rolesByProject)
  if (direct && inherited) return RANK[direct] >= RANK[inherited] ? direct : inherited
  return direct ?? inherited
}

export const useCollabStore = create<CollabState>((set, get) => ({
  rolesByDiagram: {},
  rolesByProject: {},

  loadRoles: async () => {
    if (!isSupabaseConfigured) return
    try {
      const [diagramRoles, projectRoles] = await Promise.all([getMyRoles(), getMyProjectRoles()])
      set({ rolesByDiagram: diagramRoles, rolesByProject: projectRoles })
    } catch {
      // sin sesión todavía / error transitorio
    }
  },

  roleFor: (diagramId) => {
    if (!diagramId) return null
    return effectiveRole(diagramId, get().rolesByDiagram, get().rolesByProject)
  },

  canEdit: (diagramId) => {
    if (!isSupabaseConfigured) return true // modo local: sin permisos
    if (!diagramId) return false
    const role = effectiveRole(diagramId, get().rolesByDiagram, get().rolesByProject)
    return role === 'owner' || role === 'editor'
  },

  isOwner: (diagramId) => {
    if (!isSupabaseConfigured) return true
    if (!diagramId) return false
    const role = effectiveRole(diagramId, get().rolesByDiagram, get().rolesByProject)
    return role === 'owner'
  },
}))
