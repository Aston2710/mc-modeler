import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ActiveModal, Toast, ValidationResult } from '@/domain/types'
import { generateId } from '@/utils/idGenerator'

interface UIState {
  propertiesPanelOpen: boolean
  palettePanelOpen: boolean
  selectedElementIds: string[]
  zoom: number
  validationResults: ValidationResult[]
  isExporting: boolean
  activeModal: ActiveModal
  toasts: Toast[]
  unsavedChanges: boolean
  diagramListFilter: 'all' | 'recent'
  diagramListSearch: string
  // Actions
  setPropertiesPanelOpen: (open: boolean) => void
  setPalettePanelOpen: (open: boolean) => void
  setSelectedElements: (ids: string[]) => void
  setZoom: (zoom: number) => void
  setValidationResults: (results: ValidationResult[]) => void
  setExporting: (v: boolean) => void
  openModal: (modal: ActiveModal) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setUnsavedChanges: (v: boolean) => void
  setDiagramListFilter: (f: 'all' | 'recent') => void
  setDiagramListSearch: (q: string) => void
  setImageUploadContext: (ctx: { onConfirm: (url: string) => void } | null) => void
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    propertiesPanelOpen: true,
    palettePanelOpen: true,
    selectedElementIds: [],
    zoom: 1,
    validationResults: [],
    isExporting: false,
    activeModal: null,
    toasts: [],
    unsavedChanges: false,
    diagramListFilter: 'all',
    diagramListSearch: '',
    imageUploadContext: null,

    setPropertiesPanelOpen: (open) => set((s) => { s.propertiesPanelOpen = open }),
    setPalettePanelOpen: (open) => set((s) => { s.palettePanelOpen = open }),
    setSelectedElements: (ids) => set((s) => { s.selectedElementIds = ids }),
    setZoom: (zoom) => set((s) => { s.zoom = zoom }),
    setValidationResults: (results) => set((s) => { s.validationResults = results }),
    setExporting: (v) => set((s) => { s.isExporting = v }),
    openModal: (modal) => set((s) => { s.activeModal = modal }),
    closeModal: () => set((s) => { s.activeModal = null }),

    addToast: (toast) =>
      set((s) => {
        s.toasts.push({ ...toast, id: generateId('toast') })
      }),

    removeToast: (id) =>
      set((s) => {
        s.toasts = s.toasts.filter((t) => t.id !== id)
      }),

    setUnsavedChanges: (v) => set((s) => { s.unsavedChanges = v }),
    setDiagramListFilter: (f) => set((s) => { s.diagramListFilter = f }),
    setDiagramListSearch: (q) => set((s) => { s.diagramListSearch = q }),
    setImageUploadContext: (ctx) => set((s) => { s.imageUploadContext = ctx }),
  }))
)
