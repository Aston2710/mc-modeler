import type { Diagram, Folder, Project, UserPreferences } from '@/domain/types'

/**
 * Se lanza cuando un guardado con control optimista (CAS) detecta que el diagrama
 * fue modificado por otro escritor desde que este cliente lo cargó (el updated_at
 * esperado ya no coincide). El llamador decide: re-sincronizar y reintentar, o avisar.
 */
export class DiagramConflictError extends Error {
  constructor(public readonly diagramId: string) {
    super(`Conflicto de guardado: el diagrama ${diagramId} fue modificado por otro usuario`)
    this.name = 'DiagramConflictError'
  }
}

export interface IDiagramRepository {
  // Diagrams
  getAll(): Promise<Diagram[]>
  getById(id: string): Promise<Diagram | null>
  /**
   * Guarda el diagrama. Si se pasa `expectedUpdatedAt`, aplica control optimista
   * (CAS): solo actualiza si el `updated_at` en DB coincide con el esperado; si no,
   * lanza DiagramConflictError. Devuelve el `updated_at` persistido (server-authoritative).
   */
  save(diagram: Diagram, expectedUpdatedAt?: string): Promise<string>
  delete(id: string): Promise<void>

  /**
   * Renombra SIN tocar current_xml (update dirigido a la columna name).
   * Nunca usar save() para renombrar: escribiría el XML en memoria (posiblemente
   * stale) sin CAS → clobber silencioso del trabajo de otro usuario.
   * Devuelve el nuevo updated_at si la fila cambió (el trigger lo mueve), o null.
   */
  setDiagramName(id: string, name: string): Promise<string | null>

  // Projects (agrupan diagramas; colaboración a nivel proyecto)
  getProjects(): Promise<Project[]>
  saveProject(project: Project): Promise<void>
  deleteProject(id: string): Promise<void>
  /** Devuelve el nuevo updated_at si la fila cambió, o null (ver setDiagramName). */
  setDiagramProject(diagramId: string, projectId: string | null): Promise<string | null>

  // Thumbnails stored separately to keep main list lean
  getThumbnail(id: string): Promise<string | null>
  /**
   * Devuelve el nuevo updated_at si tuvo que tocar la fila diagrams (cambio de
   * thumbnail_path — el trigger bumpea updated_at), o null si solo subió el blob.
   * El llamador DEBE adoptar ese updated_at como su versión CAS; ignorarlo deja
   * al cliente stale tras su propio guardado (conflictos fantasma).
   */
  saveThumbnail(id: string, dataUrl: string): Promise<string | null>

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
