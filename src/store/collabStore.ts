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
  /**
   * ¿Ha resuelto `loadRoles()` alguna vez?
   *
   * Sin esto, `canEdit()` devuelve `false` tanto para "este usuario es viewer"
   * como para "todavía no sé quién es", y el llamador no puede distinguirlos.
   * Esa confusión descartaba ediciones del usuario durante la ventana de
   * carga — mecanismo B de EXP-011. Ver `useCollab.ts`.
   */
  rolesLoaded: boolean
  /**
   * Estado del binding de co-edición del diagrama activo.
   *
   * `esperando` — todavía no arrancó, es lo normal durante la importación.
   * `activo`    — sincronizando; los cambios viajan en ambos sentidos.
   * `agotado`   — pasaron 10 s sin que el canvas confirmara. Se sigue
   *               reintentando, pero mientras tanto la edición NO se comparte,
   *               aunque presencia y cursores sigan funcionando.
   *
   * Nadie lo pinta todavía: hay una decisión de producto de no mostrar estado
   * de colaboración en la interfaz. Se expone porque el diagnóstico necesita
   * poder consultarlo (PLAN-014 paso 3) y para no tener que reabrir el hook
   * el día que se decida mostrarlo.
   */
  bindingState: 'esperando' | 'activo' | 'agotado'
  setBindingState: (state: 'esperando' | 'activo' | 'agotado') => void
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
  // En modo local no hay roles que cargar: la respuesta se conoce desde el
  // arranque, así que nunca hay ventana de "aún no sé".
  rolesLoaded: !isSupabaseConfigured,

  bindingState: 'esperando',
  setBindingState: (bindingState) => set({ bindingState }),

  loadRoles: async () => {
    if (!isSupabaseConfigured) return
    try {
      const [diagramRoles, projectRoles] = await Promise.all([getMyRoles(), getMyProjectRoles()])
      set({ rolesByDiagram: diagramRoles, rolesByProject: projectRoles, rolesLoaded: true })
    } catch {
      // Sin sesión todavía o error transitorio. `rolesLoaded` NO se marca:
      // seguimos sin saber, y quien pregunte debe tratarlo como incertidumbre,
      // no como una negativa.
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
