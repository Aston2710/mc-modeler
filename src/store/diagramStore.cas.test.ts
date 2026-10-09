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

import { useDiagramStore, __reiniciarConflictosExternos } from './diagramStore'
import { usePresenceStore } from './presenceStore'
import { useAuthStore } from './authStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const participante = (userId: string): any => ({ userId, name: userId, color: '#000', cursor: null })

/** Sesión colaborativa con otra persona en el canal: el caso de diseño del reintento (ADR §3.3). */
function conPar() {
  usePresenceStore.setState({ participants: { yo: participante('yo'), otro: participante('otro') } })
}
/** Solo yo en el canal: un conflicto viene de un escritor externo (DEC-013 §4). */
function solo() {
  usePresenceStore.setState({ participants: { yo: participante('yo') } })
}

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
  __reiniciarConflictosExternos()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuthStore.setState({ user: { id: 'yo' } as any })
  // Las pruebas de este bloque describen el reintento entre colaboradores en
  // vivo, que es para lo que existe: hay alguien más en la sesión.
  conPar()
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

describe('saveDiagram — escritor externo con el usuario solo en la sesión (DEC-013 §4)', () => {
  const capturar = () => {
    const eventos: { type: string; detail: unknown }[] = []
    class FakeCustomEvent {
      constructor(public type: string, init?: { detail?: unknown }) { this.detail = init?.detail }
      detail: unknown
    }
    vi.stubGlobal('CustomEvent', FakeCustomEvent)
    vi.stubGlobal('document', { dispatchEvent: (e: FakeCustomEvent) => { eventos.push({ type: e.type, detail: e.detail }); return true } })
    return eventos
  }
  beforeEach(() => solo())

  it('NO reintenta: pregunta, no adopta la versión ajena y deja la pestaña con cambios sin guardar', async () => {
    const eventos = capturar()
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'escrito-por-el-conector' })
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(save).toHaveBeenCalledTimes(1) // sin reintento: el cambio externo no se pisa
      expect(eventos).toEqual([{ type: 'flujo:save-conflict', detail: { id: 'd1', externo: true } }])
      const st = useDiagramStore.getState()
      expect(st.diagrams[0].updatedAt).toBe('v1') // sigue con su versión: el siguiente guardado no puede pisar
      expect(st.tabs[0].dirty).toBe(true) // su trabajo sigue pendiente, no se da por guardado
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('mientras no se resuelva, los autoguardados siguientes no escriben ni vuelven a avisar', async () => {
    const eventos = capturar()
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'externo' })
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(save).toHaveBeenCalledTimes(1)
      expect(eventos).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('recargar la versión del servidor resuelve el conflicto y se vuelve a guardar', async () => {
    const eventos = capturar()
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'externo' })
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'externo' })
      await useDiagramStore.getState().refreshXml('d1')
      expect(useDiagramStore.getState().diagrams[0].updatedAt).toBe('v9')
      save.mockResolvedValueOnce('v10')
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(save).toHaveBeenLastCalledWith(expect.any(Object), 'v9') // CAS sobre la versión recargada
      expect(eventos).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('si el servidor ya tiene este mismo contenido, adopta sin preguntar (igual que con pares)', async () => {
    const eventos = capturar()
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: VALID_XML })
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(eventos).toEqual([])
      expect(useDiagramStore.getState().diagrams[0].updatedAt).toBe('v9')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('sin datos de presencia todavía se trata como solo: pregunta en vez de pisar', async () => {
    usePresenceStore.setState({ participants: {} })
    const eventos = capturar()
    try {
      save.mockRejectedValueOnce(new DiagramConflictError('d1'))
      getById.mockResolvedValueOnce({ ...seedDiagram(), updatedAt: 'v9', xml: 'externo' })
      await useDiagramStore.getState().saveDiagram('d1', VALID_XML)
      expect(save).toHaveBeenCalledTimes(1)
      expect(eventos).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
