import type { Diagram, Folder, Project, UserPreferences } from '@/domain/types'

export interface IDiagramRepository {
  // Diagrams
  getAll(): Promise<Diagram[]>
  getById(id: string): Promise<Diagram | null>
  save(diagram: Diagram): Promise<void>
  delete(id: string): Promise<void>

  // Projects (agrupan diagramas; colaboración a nivel proyecto)
  getProjects(): Promise<Project[]>
  saveProject(project: Project): Promise<void>
  deleteProject(id: string): Promise<void>
  setDiagramProject(diagramId: string, projectId: string | null): Promise<void>

  // Thumbnails stored separately to keep main list lean
  getThumbnail(id: string): Promise<string | null>
  saveThumbnail(id: string, dataUrl: string): Promise<void>

  // Sub-process overlay thumbnails — keyed separately from diagram thumbnails
  getSubProcessThumbnail(parentId: string, elementId: string): Promise<string | null>
  saveSubProcessThumbnail(parentId: string, elementId: string, dataUrl: string): Promise<void>
  deleteSubProcessThumbnail(parentId: string, elementId: string): Promise<void>

  // Delete a diagram and all its descendant sub-process diagrams recursively
  deleteWithChildren(id: string): Promise<void>

  // Folders
  getFolders(): Promise<Folder[]>
  saveFolder(folder: Folder): Promise<void>
  deleteFolder(id: string): Promise<void>

  // Preferences
  getPreferences(): Promise<UserPreferences>
  savePreferences(prefs: UserPreferences): Promise<void>
}
