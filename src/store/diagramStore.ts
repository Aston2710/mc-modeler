import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Diagram, DiagramTab, Project } from '@/domain/types'
import { diagramRepository } from '@/persistence'
import { generateDiagramId } from '@/utils/idGenerator'

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
      const diagrams = await diagramRepository.getAll()
      // Hidratar thumbnails desde el store separado (thumbnails no se guardan
      // en el array principal de diagramas para mantenerlo ligero)
      const withThumbs = await Promise.all(
        diagrams.map(async (d) => ({
          ...d,
          thumbnail: await diagramRepository.getThumbnail(d.id),
        }))
      )
      set((s) => {
        s.diagrams = withThumbs
        s.isLoading = false
      })
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
      const updated: Diagram = { ...diagram, xml, elementCount, updatedAt: now }
      // El XML es lo crítico. El thumbnail es best-effort: si falla su subida
      // (p. ej. Storage), NO debe hacer fallar el guardado del diagrama.
      await diagramRepository.save(updated)
      try {
        if (thumbnail !== undefined) {
          await diagramRepository.saveThumbnail(id, thumbnail ?? '')
        }
        if (diagram.parentDiagramId && diagram.subProcessElementId && thumbnail) {
          await diagramRepository.saveSubProcessThumbnail(
            diagram.parentDiagramId,
            diagram.subProcessElementId,
            thumbnail
          )
        }
      } catch (err) {
        console.warn('[Flujo] thumbnail no se pudo guardar (no crítico):', err)
      }

      set((s) => {
        const idx = s.diagrams.findIndex((d) => d.id === id)
        if (idx >= 0) {
          s.diagrams[idx] = updated
          if (thumbnail !== undefined) s.diagrams[idx].thumbnail = thumbnail ?? null
        }
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.dirty = false
        s.lastSavedAt = now
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
      const newId = generateDiagramId()
      const now = new Date().toISOString()
      const copy: Diagram = {
        ...source,
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
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        name,
        xml,
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
