import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Diagram, DiagramTab, Project } from '@/domain/types'
import { diagramRepository } from '@/persistence'
import { DiagramConflictError } from '@/persistence/IDiagramRepository'
import { generateDiagramId } from '@/utils/idGenerator'
import { normalizeBpmnXml } from '@/utils/normalizeBpmnXml'

/**
 * Validación mínima antes de persistir: no guardar XML vacío o que no parezca
 * BPMN (evita pisar datos buenos con un canvas roto/vacío). No pretende validar
 * el modelo completo, solo descartar basura evidente. Además del regex, verifica
 * que el XML esté bien formado (DOMParser) — barato y ataja truncados/corruptos.
 */
function looksLikeBpmn(xml: string): boolean {
  if (!xml || xml.length <= 50 || !/<(?:\w+:)?definitions[\s>]/.test(xml)) return false
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml')
      if (doc.getElementsByTagName('parsererror').length > 0) return false
    } catch { /* entorno sin XML parser: caer al regex */ }
  }
  return true
}

const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Proceso 1" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="157" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const EMPTY_SUBPROCESS_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_sub"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_sub">
    <bpmn:participant id="Participant_sub" name="Sub proceso" processRef="Process_sub" />
  </bpmn:collaboration>
  <bpmn:process id="Process_sub" isExecutable="false">
    <bpmn:startEvent id="StartEvent_sub" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_sub">
    <bpmndi:BPMNPlane id="BPMNPlane_sub" bpmnElement="Collaboration_sub">
      <bpmndi:BPMNShape id="Participant_sub_di" bpmnElement="Participant_sub" isHorizontal="true">
        <dc:Bounds x="100" y="50" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_sub_di" bpmnElement="StartEvent_sub">
        <dc:Bounds x="152" y="157" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

interface DiagramState {
  diagrams: Diagram[]
  tabs: DiagramTab[]
  activeTabId: string | null
  isLoading: boolean
  lastSavedAt: string | null
  // Actions
  loadAll: () => Promise<void>
  createDiagram: (name: string, projectId?: string | null) => Promise<string>
  createSubDiagram: (name: string, parentDiagramId: string, subProcessElementId: string) => Promise<string>
  openDiagram: (id: string) => void
  /** Trae el XML del diagrama bajo demanda (la lista no lo carga). Cachea en memoria. */
  ensureXml: (id: string) => Promise<string>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  saveDiagram: (id: string, xml: string, elementCount?: number, thumbnail?: string | null) => Promise<void>
  saveThumbnailOnly: (id: string, thumbnail: string) => Promise<void>
  renameDiagram: (id: string, name: string) => Promise<void>
  duplicateDiagram: (id: string) => Promise<string>
  deleteDiagram: (id: string) => Promise<void>
  deleteWithChildren: (id: string) => Promise<void>
  importDiagram: (xml: string, name: string, projectId?: string | null) => Promise<string>
  markTabDirty: (id: string, dirty: boolean) => void
  renameTab: (id: string, name: string) => void
  activeDiagram: () => Diagram | null
  getChildren: (parentId: string) => Diagram[]
  getChildByElement: (parentId: string, subProcessElementId: string) => Diagram | null
  // Proyectos
  projects: Project[]
  loadProjects: () => Promise<void>
  createProject: (name: string) => Promise<string>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  moveDiagramToProject: (diagramId: string, projectId: string | null) => Promise<void>
}

export const useDiagramStore = create<DiagramState>()(
  immer((set, get) => ({
    diagrams: [],
    tabs: [],
    activeTabId: null,
    isLoading: false,
    lastSavedAt: null,
    projects: [],

    loadAll: async () => {
      set((s) => { s.isLoading = true })
      // getAll trae SOLO metadata (sin current_xml) → carga liviana y rápida.
      const diagrams = await diagramRepository.getAll()
      // Mostrar las tarjetas de inmediato; NO bloquear la lista esperando thumbnails.
      // Conservar los thumbnails ya cargados: si loadAll se re-ejecuta (p. ej. al
      // refrescarse la sesión), NO blanquear lo que ya se mostraba → sin parpadeo.
      set((s) => {
        const prevThumbs = new Map(s.diagrams.map((d) => [d.id, d.thumbnail]))
        s.diagrams = diagrams.map((d) => ({ ...d, thumbnail: prevThumbs.get(d.id) ?? null }))
        s.isLoading = false
      })
      // Hidratar en segundo plano SOLO los thumbnails que aún no tenemos.
      void Promise.all(
        diagrams.map(async (d) => {
          if (get().diagrams.find((z) => z.id === d.id)?.thumbnail) return
          const thumbnail = await diagramRepository.getThumbnail(d.id).catch(() => null)
          if (thumbnail == null) return
          set((s) => {
            const x = s.diagrams.find((z) => z.id === d.id)
            if (x && !x.thumbnail) x.thumbnail = thumbnail
          })
        })
      )
    },

    ensureXml: async (id) => {
      const existing = get().diagrams.find((d) => d.id === id)
      if (existing && existing.xml) return existing.xml
      // La lista no trae el XML; se pide el diagrama completo la primera vez y se cachea.
      const full = await diagramRepository.getById(id)
      const xml = full?.xml ?? ''
      if (xml) {
        set((s) => {
          const d = s.diagrams.find((d) => d.id === id)
          if (d) d.xml = xml
        })
      }
      return xml
    },

    createDiagram: async (name, projectId = null) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        name,
        xml: EMPTY_BPMN,
        thumbnail: null,
        folderId: null,
        projectId,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        parentDiagramId: null,
        subProcessElementId: null,
      }
      await diagramRepository.save(diagram)
      set((s) => {
        s.diagrams.push(diagram)
        s.tabs.push({ id, name, dirty: false })
        s.activeTabId = id
      })
      return id
    },

    createSubDiagram: async (name, parentDiagramId, subProcessElementId) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      // El subproceso hereda el proyecto del diagrama padre.
      const parent = get().diagrams.find((d) => d.id === parentDiagramId)
      const diagram: Diagram = {
        id,
        name,
        xml: EMPTY_SUBPROCESS_BPMN,
        thumbnail: null,
        folderId: null,
        projectId: parent?.projectId ?? null,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        parentDiagramId,
        subProcessElementId,
      }
      await diagramRepository.save(diagram)
      set((s) => {
        s.diagrams.push(diagram)
        s.tabs.push({ id, name, dirty: false })
        s.activeTabId = id
      })
      return id
    },

    openDiagram: (id) => {
      set((s) => {
        const diagram = s.diagrams.find((d) => d.id === id)
        if (!diagram) return
        const exists = s.tabs.some((t) => t.id === id)
        if (!exists) {
          s.tabs.push({ id, name: diagram.name, dirty: false })
        }
        s.activeTabId = id
      })
    },

    closeTab: (id) => {
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id)
        s.tabs.splice(idx, 1)
        if (s.activeTabId === id) {
          s.activeTabId = s.tabs[Math.max(0, idx - 1)]?.id ?? null
        }
      })
    },

    setActiveTab: (id) => {
      set((s) => { s.activeTabId = id })
    },

    saveDiagram: async (id, xml, elementCount = 0, thumbnail) => {
      const now = new Date().toISOString()
      const diagram = get().diagrams.find((d) => d.id === id)
      if (!diagram) return
      // Validación: no persistir XML vacío/roto → no pisar datos buenos con basura.
      if (!looksLikeBpmn(xml)) {
        console.warn('[Flujo] guardado omitido: XML inválido/vacío para', id)
        return
      }
      const updated: Diagram = { ...diagram, xml, elementCount, updatedAt: now }

      // Control optimista (CAS): esperado = el updated_at que teníamos en memoria.
      // Si otro escritor guardó antes, DiagramConflictError. En tiempo real todos
      // tienen ~el mismo estado, así que re-sincronizamos y reintentamos UNA vez
      // (último-gana seguro, sin torn-write). Si vuelve a chocar, aceptamos el
      // estado del otro (ya persistió lo acordado) y refrescamos la versión local.
      let persistedUpdatedAt: string
      try {
        persistedUpdatedAt = await diagramRepository.save(updated, diagram.updatedAt)
      } catch (e) {
        if (!(e instanceof DiagramConflictError)) throw e
        const fresh = await diagramRepository.getById(id)
        if (!fresh) return // borrado por otro → nada que guardar
        try {
          persistedUpdatedAt = await diagramRepository.save(updated, fresh.updatedAt)
        } catch (e2) {
          if (!(e2 instanceof DiagramConflictError)) throw e2
          console.warn('[Flujo] conflicto de guardado persistente; se acepta el estado del otro escritor para', id)
          set((s) => {
            const d = s.diagrams.find((d) => d.id === id)
            if (d) d.updatedAt = fresh.updatedAt
            const tab = s.tabs.find((t) => t.id === id)
            if (tab) tab.dirty = false
          })
          return
        }
      }

      // El thumbnail es best-effort: si falla su subida (p. ej. Storage), NO debe
      // hacer fallar el guardado del diagrama.
      try {
        if (thumbnail !== undefined) {
          await diagramRepository.saveThumbnail(id, thumbnail ?? '')
        }
      } catch (err) {
        console.warn('[Flujo] thumbnail no se pudo guardar (no crítico):', err)
      }

      set((s) => {
        const idx = s.diagrams.findIndex((d) => d.id === id)
        if (idx >= 0) {
          // Guardar el updated_at persistido (server-authoritative) para el próximo CAS.
          s.diagrams[idx] = { ...updated, updatedAt: persistedUpdatedAt }
          if (thumbnail !== undefined) s.diagrams[idx].thumbnail = thumbnail ?? null
        }
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.dirty = false
        s.lastSavedAt = persistedUpdatedAt
      })
    },

    saveThumbnailOnly: async (id, thumbnail) => {
      await diagramRepository.saveThumbnail(id, thumbnail)
      set((s) => {
        const d = s.diagrams.find((d) => d.id === id)
        if (d) d.thumbnail = thumbnail
      })
    },
    
    renameDiagram: async (id, name) => {
      const diagram = get().diagrams.find((d) => d.id === id)
      if (!diagram) return
      const updated: Diagram = { ...diagram, name, updatedAt: new Date().toISOString() }
      await diagramRepository.save(updated)
      set((s) => {
        const d = s.diagrams.find((d) => d.id === id)
        if (d) d.name = name
        const t = s.tabs.find((t) => t.id === id)
        if (t) t.name = name
      })
    },

    duplicateDiagram: async (id) => {
      const source = get().diagrams.find((d) => d.id === id)
      if (!source) throw new Error('Diagram not found')
      // El XML puede no estar en memoria (la lista no lo carga) → traerlo.
      const xml = source.xml || (await get().ensureXml(id))
      const newId = generateDiagramId()
      const now = new Date().toISOString()
      const copy: Diagram = {
        ...source,
        xml,
        id: newId,
        name: `${source.name} (copia)`,
        thumbnail: null,
        parentDiagramId: null,
        subProcessElementId: null,
        createdAt: now,
        updatedAt: now,
      }
      await diagramRepository.save(copy)
      set((s) => { s.diagrams.push(copy) })
      return newId
    },

    deleteDiagram: async (id) => {
      await diagramRepository.delete(id)
      set((s) => {
        s.diagrams = s.diagrams.filter((d) => d.id !== id)
        const idx = s.tabs.findIndex((t) => t.id === id)
        if (idx >= 0) {
          s.tabs.splice(idx, 1)
          if (s.activeTabId === id) {
            s.activeTabId = s.tabs[Math.max(0, idx - 1)]?.id ?? null
          }
        }
      })
    },

    importDiagram: async (xml, name, projectId = null) => {
      // Serialización canónica (ADR §6.4): nunca persistir el XML crudo del
      // archivo — re-serializar con el mismo serializer que usa el autosave
      // (un solo dialecto). Si no parsea, lanza y el import se rechaza.
      const canonicalXml = await normalizeBpmnXml(xml)
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        name,
        xml: canonicalXml,
        thumbnail: null,
        folderId: null,
        projectId,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        parentDiagramId: null,
        subProcessElementId: null,
      }
      await diagramRepository.save(diagram)
      set((s) => {
        s.diagrams.push(diagram)
        s.tabs.push({ id, name, dirty: false })
        s.activeTabId = id
      })
      return id
    },

    markTabDirty: (id, dirty) => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.dirty = dirty
      })
    },

    renameTab: (id, name) => {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.name = name
      })
    },

    activeDiagram: () => {
      const { diagrams, activeTabId } = get()
      return diagrams.find((d) => d.id === activeTabId) ?? null
    },
    
    deleteWithChildren: async (id) => {
      const allDiagrams = get().diagrams
      const collectIds = (parentId: string): string[] => {
        const result: string[] = [parentId]
        const children = allDiagrams.filter((d) => d.parentDiagramId === parentId)
        for (const child of children) result.push(...collectIds(child.id))
        return result
      }
      const idsToDelete = collectIds(id)
      await diagramRepository.deleteWithChildren(id)
      set((s) => {
        s.diagrams = s.diagrams.filter((d) => !idsToDelete.includes(d.id))
        for (const did of idsToDelete) {
          const idx = s.tabs.findIndex((t) => t.id === did)
          if (idx >= 0) {
            s.tabs.splice(idx, 1)
            if (s.activeTabId === did) {
              s.activeTabId = s.tabs[Math.max(0, idx - 1)]?.id ?? null
            }
          }
        }
      })
    },

    getChildren: (parentId) => {
      return get().diagrams.filter((d) => d.parentDiagramId === parentId)
    },

    getChildByElement: (parentId, subProcessElementId) => {
      return get().diagrams.find(
        (d) => d.parentDiagramId === parentId && d.subProcessElementId === subProcessElementId
      ) ?? null
    },

    // ── Proyectos ──────────────────────────────────────────────
    loadProjects: async () => {
      const projects = await diagramRepository.getProjects()
      set((s) => { s.projects = projects })
    },

    createProject: async (name) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const project: Project = { id, name, ownerId: '', createdAt: now, updatedAt: now }
      await diagramRepository.saveProject(project)
      set((s) => { s.projects.push(project) })
      return id
    },

    renameProject: async (id, name) => {
      const project = get().projects.find((p) => p.id === id)
      if (!project) return
      const updated: Project = { ...project, name, updatedAt: new Date().toISOString() }
      await diagramRepository.saveProject(updated)
      set((s) => {
        const p = s.projects.find((p) => p.id === id)
        if (p) p.name = name
      })
    },

    deleteProject: async (id) => {
      await diagramRepository.deleteProject(id)
      set((s) => {
        s.projects = s.projects.filter((p) => p.id !== id)
        // Diagramas del proyecto quedan sueltos.
        s.diagrams.forEach((d) => { if (d.projectId === id) d.projectId = null })
      })
    },

    moveDiagramToProject: async (diagramId, projectId) => {
      await diagramRepository.setDiagramProject(diagramId, projectId)
      set((s) => {
        const d = s.diagrams.find((d) => d.id === diagramId)
        if (d) d.projectId = projectId
      })
    },

  }))
)
