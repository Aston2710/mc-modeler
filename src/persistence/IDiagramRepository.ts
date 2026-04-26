import type { Diagram, Folder, UserPreferences } from '@/domain/types'

export interface IDiagramRepository {
  // Diagrams
  getAll(): Promise<Diagram[]>
  getById(id: string): Promise<Diagram | null>
  save(diagram: Diagram): Promise<void>
  delete(id: string): Promise<void>

  // Thumbnails stored separately to keep main list lean
  getThumbnail(id: string): Promise<string | null>
  saveThumbnail(id: string, dataUrl: string): Promise<void>

  // Folders
  getFolders(): Promise<Folder[]>
  saveFolder(folder: Folder): Promise<void>
  deleteFolder(id: string): Promise<void>

  // Preferences
  getPreferences(): Promise<UserPreferences>
  savePreferences(prefs: UserPreferences): Promise<void>
}
