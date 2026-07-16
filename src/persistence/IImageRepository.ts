import type { ImageFolder, LibraryImage } from '@/domain/types'

/**
 * Repositorio de la biblioteca de imágenes. Abstrae la persistencia igual que
 * IDiagramRepository: LocalImageRepository (IndexedDB) en modo local,
 * SupabaseImageRepository (Postgres + Storage) en la nube.
 *
 * Los metadatos (getAll) NUNCA traen bytes — solo la ficha. Los bytes se piden
 * bajo demanda con getImageData (al abrir el lightbox), como dataURL.
 */
export interface IImageRepository {
  getAll(): Promise<LibraryImage[]>
  /**
   * Sube una imagen (dataURL) a la biblioteca y devuelve su ficha.
   * `scopeId` = projectId si la imagen pertenece a un proyecto, si no el uid del
   * usuario (imágenes sueltas). Se usa como primer segmento del path de Storage.
   */
  upload(params: {
    dataUrl: string
    name: string
    projectId: string | null
    folderId: string | null
  }): Promise<LibraryImage>
  rename(id: string, name: string): Promise<void>
  move(id: string, folderId: string | null): Promise<void>
  delete(id: string): Promise<void>
  /** Devuelve los bytes de la imagen como dataURL (con caché). */
  getImageData(image: LibraryImage): Promise<string | null>

  getFolders(): Promise<ImageFolder[]>
  saveFolder(folder: ImageFolder): Promise<void>
  deleteFolder(id: string): Promise<void>
}
