import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Diagram, DiagramTab } from '@/domain/types'
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

interface DiagramState {
  diagrams: Diagram[]
  tabs: DiagramTab[]
  activeTabId: string | null
  isLoading: boolean
  lastSavedAt: string | null
  // Actions
  loadAll: () => Promise<void>
  createDiagram: (name: string) => Promise<string>
  openDiagram: (id: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  saveDiagram: (id: string, xml: string, elementCount?: number) => Promise<void>
  renameDiagram: (id: string, name: string) => Promise<void>
  duplicateDiagram: (id: string) => Promise<string>
  deleteDiagram: (id: string) => Promise<void>
  importDiagram: (xml: string, name: string) => Promise<string>
  markTabDirty: (id: string, dirty: boolean) => void
  renameTab: (id: string, name: string) => void
  activeDiagram: () => Diagram | null
}

export const useDiagramStore = create<DiagramState>()(
  immer((set, get) => ({
    diagrams: [],
    tabs: [],
    activeTabId: null,
    isLoading: false,
    lastSavedAt: null,

    loadAll: async () => {
      set((s) => { s.isLoading = true })
      const diagrams = await diagramRepository.getAll()
      set((s) => {
        s.diagrams = diagrams
        s.isLoading = false
      })
    },

    createDiagram: async (name) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        name,
        xml: EMPTY_BPMN,
        thumbnail: null,
        folderId: null,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
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

    saveDiagram: async (id, xml, elementCount = 0) => {
      const now = new Date().toISOString()
      const diagram = get().diagrams.find((d) => d.id === id)
      if (!diagram) return
      const updated: Diagram = { ...diagram, xml, elementCount, updatedAt: now }
      await diagramRepository.save(updated)
      set((s) => {
        const idx = s.diagrams.findIndex((d) => d.id === id)
        if (idx >= 0) s.diagrams[idx] = updated
        const tab = s.tabs.find((t) => t.id === id)
        if (tab) tab.dirty = false
        s.lastSavedAt = now
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

    importDiagram: async (xml, name) => {
      const id = generateDiagramId()
      const now = new Date().toISOString()
      const diagram: Diagram = {
        id,
        name,
        xml,
        thumbnail: null,
        folderId: null,
        elementCount: 0,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
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
  }))
)
