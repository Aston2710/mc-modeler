export interface Diagram {
  id: string
  name: string
  xml: string
  thumbnail: string | null
  folderId: string | null
  elementCount: number
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface Folder {
  id: string
  name: string
  createdAt: string
}

export interface UserPreferences {
  language: 'es' | 'en'
  theme: 'light' | 'dark' | 'system'
  gridEnabled: boolean
  gridSize: 5 | 10 | 20
  snapToGrid: boolean
  autoSaveInterval: number
  lastOpenedDiagramId: string | null
  paletteMode: 'grid' | 'dropdown' | 'bizagi'
}

export interface ValidationResult {
  id: string
  elementId: string | null
  elementName: string | null
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

export type ActiveModal =
  | 'export'
  | 'import'
  | 'shortcuts'
  | 'validation'
  | 'newDiagram'
  | 'imageUpload'
  | null

export interface UIState {
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
  imageUploadContext: { onConfirm: (url: string) => void } | null
}

export interface DiagramTab {
  id: string
  name: string
  dirty: boolean
}
