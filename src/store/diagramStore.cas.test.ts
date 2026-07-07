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

  it('conflicto persistente (doble, contenido divergente) → acepta el estado del otro, sin lanzar ni pisar', async () => {
    save.mockRejectedValueOnce(new DiagramConflictError('d1'))
    getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'remoto-distinto' })
    save.mockRejectedValueOnce(new DiagramConflictError('d1'))
    getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v10', xml: 'remoto-distinto-2' })
    // No debe lanzar
    await expect(useDiagramStore.getState().saveDiagram('d1', VALID_XML)).resolves.toBeUndefined()
    const st = useDiagramStore.getState()
    expect(st.diagrams[0].updatedAt).toBe('v10') // refrescado al del otro escritor
    expect(st.tabs[0].dirty).toBe(false)
  })

  it('conflicto pero el server YA tiene este contenido → adopta la versión sin escribir (idempotencia tiempo real)', async () => {
    save.mockRejectedValueOnce(new DiagramConflictError('d1'))
    getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: VALID_XML })
    await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
    expect(save).toHaveBeenCalledTimes(1) // NO reintenta: ya está persistido
    const st = useDiagramStore.getState()
    expect(st.diagrams[0].updatedAt).toBe('v9')
    expect(st.tabs[0].dirty).toBe(false)
  })

  it('doble conflicto pero al final el server tiene este contenido → adopta sin notificar', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('document', { dispatchEvent })
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'otro' })
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v10', xml: VALID_XML })
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(dispatchEvent).not.toHaveBeenCalled() // sin divergencia real → sin toast
      expect(useDiagramStore.getState().diagrams[0].updatedAt).toBe('v10')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('thumbnail que toca la fila (bump del trigger) → la versión local adopta el nuevo updated_at', async () => {
    save.mockResolvedValueOnce('v2')
    saveThumbnail.mockResolvedValueOnce('v3') // primera vez: UPDATE thumbnail_path → trigger
    await useDiagramStore.getState().saveDiagram('d1', VALID_XML, 1, 'data:image/webp;base64,x')
    expect(useDiagramStore.getState().diagrams[0].updatedAt).toBe('v3') // no queda stale
  })

  it('conflicto persistente (doble) → notifica a la UI (evento flujo:save-conflict)', async () => {
    // Entorno node: sin DOM. Simular `document` para capturar el CustomEvent.
    const dispatched: { type: string; detail: unknown }[] = []
    class FakeCustomEvent {
      type: string
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    }
    vi.stubGlobal('CustomEvent', FakeCustomEvent)
    vi.stubGlobal('document', {
      dispatchEvent: (e: FakeCustomEvent) => { dispatched.push({ type: e.type, detail: e.detail }); return true },
    })
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'otro-1' })
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v10', xml: 'otro-2' })
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(dispatched).toEqual([{ type: 'flujo:save-conflict', detail: { id: 'd1' } }])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('conflicto resuelto al primer reintento → NO notifica a la UI', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('document', { dispatchEvent })
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'otro' })
      save.mockResolvedValueOnce('v10')
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(dispatchEvent).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
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
