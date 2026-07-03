import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiagramConflictError } from '@/persistence/IDiagramRepository'

// Mock del repositorio (hoisted para que vi.mock lo capture).
const { save, getById, saveThumbnail } = vi.hoisted(() => ({
  save: vi.fn(),
  getById: vi.fn(),
  saveThumbnail: vi.fn(),
}))
vi.mock('@/persistence', () => ({
  diagramRepository: { save, getById, saveThumbnail },
}))

import { useDiagramStore } from './diagramStore'

const VALID_XML =
  '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions id="Definitions_1"><bpmn:process id="P"/></bpmn:definitions>'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const seedDiagram = (): any => ({
  id: 'd1', name: 'D1', xml: 'viejo', thumbnail: null, folderId: null, projectId: null,
  elementCount: 0, schemaVersion: 1, createdAt: 't0', updatedAt: 'v1',
  parentDiagramId: null, subProcessElementId: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  saveThumbnail.mockResolvedValue(undefined)
  useDiagramStore.setState({
    diagrams: [seedDiagram()],
    tabs: [{ id: 'd1', name: 'D1', dirty: true }],
    activeTabId: 'd1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
})

describe('saveDiagram — control optimista (CAS)', () => {
  it('guardado normal: pasa el updated_at esperado y guarda el persistido', async () => {
    save.mockResolvedValueOnce('v2')
    await useDiagramStore.getState().saveDiagram('d1', VALID_XML, 5)
    // CAS: esperado = updated_at que teníamos en memoria (v1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1', xml: VALID_XML }), 'v1')
    const st = useDiagramStore.getState()
    expect(st.diagrams[0].updatedAt).toBe('v2') // server-authoritative
    expect(st.tabs[0].dirty).toBe(false)
  })

  it('conflicto una vez → re-sincroniza y reintenta con la versión fresca', async () => {
    save.mockRejectedValueOnce(new DiagramConflictError('d1'))
    getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'remoto' })
    save.mockResolvedValueOnce('v10')
    await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
    expect(getById).toHaveBeenCalledWith('d1')
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenNthCalledWith(2, expect.any(Object), 'v9') // reintento con fresca
    expect(useDiagramStore.getState().diagrams[0].updatedAt).toBe('v10')
  })

  it('conflicto persistente (doble) → acepta el estado del otro, sin lanzar ni pisar', async () => {
    save.mockRejectedValueOnce(new DiagramConflictError('d1'))
    getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9' })
    save.mockRejectedValueOnce(new DiagramConflictError('d1'))
    // No debe lanzar
    await expect(useDiagramStore.getState().saveDiagram('d1', VALID_XML)).resolves.toBeUndefined()
    const st = useDiagramStore.getState()
    expect(st.diagrams[0].updatedAt).toBe('v9') // refrescado al del otro escritor
    expect(st.tabs[0].dirty).toBe(false)
  })

  it('XML inválido/vacío → NO llama a save (no pisa datos buenos)', async () => {
    await useDiagramStore.getState().saveDiagram('d1', '')
    await useDiagramStore.getState().saveDiagram('d1', '<xml>no bpmn</xml>')
    expect(save).not.toHaveBeenCalled()
  })

  it('diagrama borrado por otro (getById null) → aborta sin guardar', async () => {
    save.mockRejectedValueOnce(new DiagramConflictError('d1'))
    getById.mockResolvedValueOnce(null)
    await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
    expect(save).toHaveBeenCalledTimes(1) // no reintenta si ya no existe
  })
})
