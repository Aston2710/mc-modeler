import type { Diagram, Folder, Project, UserPreferences } from '@/domain/types'
import type { StoredDocumentHeader } from '@/utils/documentHeader'

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
  /** Soft delete: marca deleted_at (a la papelera). Conserva thumbnail e imágenes. */
  delete(id: string): Promise<void>
  /** Quita de la papelera (deleted_at = null). */
  restore(id: string): Promise<void>
  /** Borrado DEFINITIVO (DELETE real + thumbnail). Irreversible. */
  purge(id: string): Promise<void>

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
  /** Soft delete del proyecto Y sus diagramas (a la papelera juntos). */
  deleteProject(id: string): Promise<void>
  /** Restaura el proyecto y sus diagramas borrados. */
  restoreProject(id: string): Promise<void>
  /** Borrado DEFINITIVO del proyecto y sus diagramas. Irreversible. */
  purgeProject(id: string): Promise<void>
  /** Contenido de la papelera (diagramas + proyectos con deleted_at). */
  getTrash(): Promise<{ diagrams: Diagram[]; projects: Project[] }>
  /** Vacía la papelera: borrado DEFINITIVO de TODO lo que tenga deleted_at. */
  purgeAll(): Promise<void>
  /** Devuelve el nuevo updated_at si la fila cambió, o null (ver setDiagramName). */
  setDiagramProject(diagramId: string, projectId: string | null): Promise<string | null>

  // Thumbnails stored separately to keep main list lean
  getThumbnail(id: string): Promise<string | null>
  /**
   * Resuelve varios thumbnails de una vez. Devuelve un Map id → src listo para
   * un `<img>`; los ids sin thumbnail simplemente no aparecen.
   *
   * Existe porque pedirlos de uno en uno era el coste dominante de la portada:
   * 78 descargas autenticadas secuenciales más 78 conversiones a base64, unos
   * 4 MB por el hilo principal. En la nube esto es **una** llamada que firma
   * todas las rutas a la vez, y luego el navegador descarga las imágenes en
   * paralelo con su propia caché.
   */
  getThumbnailUrls(ids: string[]): Promise<Map<string, string>>
  /**
   * Vuelve a resolver el thumbnail de UN diagrama, ignorando cualquier caché.
   *
   * Existe porque las URLs que devuelve `getThumbnailUrls` **caducan**, y el
   * store solo las pide una vez por sesión: si una tarjeta con `loading="lazy"`
   * entra en pantalla pasada la vida de la firma, el `<img>` pide una URL
   * expirada y queda roto. Esto es la red de seguridad del `onError`.
   *
   * Devuelve `null` si el diagrama no tiene thumbnail o no se pudo resolver.
   */
  refreshThumbnailUrl(id: string): Promise<string | null>
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

  /**
   * Plantilla de la cabecera del proyecto (PLAN-034). `null` si el proyecto no
   * define ninguna, que es el estado por defecto de todos.
   *
   * Va en un método aparte y NO en `getProjects()` a propósito: la lista de
   * proyectos se carga en la portada y no muestra la cabecera. Traerlo ahí sería
   * repetir la trampa de `select('*')` que PLAN-012 desmontó con
   * `LIST_COLUMNS`. Se pide solo cuando se va a exportar o a editar.
   */
  getProjectDocTemplate(projectId: string): Promise<StoredDocumentHeader | null>
  /** `null` quita la cabecera del proyecto. */
  saveProjectDocTemplate(projectId: string, template: StoredDocumentHeader | null): Promise<void>
}
