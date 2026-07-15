import { describe, it, expect, beforeEach, vi } from 'vitest'

// Simular modo nube (Supabase configurado) para ejercitar el gate real de roles.
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: null,
}))
// getMyRoles / getMyProjectRoles no se invocan aquí (sembramos el estado a mano).
vi.mock('@/lib/sharing', () => ({
  getMyRoles: async () => ({}),
  getMyProjectRoles: async () => ({}),
}))

import { useCollabStore } from './collabStore'
import { useDiagramStore } from './diagramStore'

const DID = 'diagram-1'

beforeEach(() => {
  useCollabStore.setState({ rolesByDiagram: {}, rolesByProject: {} })
  // Diagrama suelto (sin proyecto) para que no herede rol.
  useDiagramStore.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    diagrams: [{ id: DID, projectId: null }] as any,
  })
})

describe('collabStore.canEdit — gate de solo-lectura (modo nube)', () => {
  it('viewer NO puede editar', () => {
    useCollabStore.setState({ rolesByDiagram: { [DID]: 'viewer' } })
    expect(useCollabStore.getState().canEdit(DID)).toBe(false)
    expect(useCollabStore.getState().isOwner(DID)).toBe(false)
  })

  it('editor y owner SÍ pueden editar', () => {
    useCollabStore.setState({ rolesByDiagram: { [DID]: 'editor' } })
    expect(useCollabStore.getState().canEdit(DID)).toBe(true)

    useCollabStore.setState({ rolesByDiagram: { [DID]: 'owner' } })
    expect(useCollabStore.getState().canEdit(DID)).toBe(true)
    expect(useCollabStore.getState().isOwner(DID)).toBe(true)
  })

  it('sin rol (sin acceso) NO puede editar', () => {
    expect(useCollabStore.getState().canEdit(DID)).toBe(false)
  })

  it('rol de diagrama vence al heredado si es más permisivo, pero viewer sigue sin editar', () => {
    // Proyecto da editor, pero el diagrama fija viewer directo → efectivo = editor (más permisivo).
    useDiagramStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      diagrams: [{ id: DID, projectId: 'proj-1' }] as any,
    })
    useCollabStore.setState({
      rolesByDiagram: { [DID]: 'viewer' },
      rolesByProject: { 'proj-1': 'editor' },
    })
    // Efectivo = el más permisivo (editor) → puede editar.
    expect(useCollabStore.getState().canEdit(DID)).toBe(true)

    // Si ambos son viewer → no puede.
    useCollabStore.setState({
      rolesByDiagram: { [DID]: 'viewer' },
      rolesByProject: { 'proj-1': 'viewer' },
    })
    expect(useCollabStore.getState().canEdit(DID)).toBe(false)
  })
})
