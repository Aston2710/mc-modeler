import localforage from 'localforage'
import type { IImageRepository } from './IImageRepository'
import type { ImageFolder, LibraryImage } from '@/domain/types'
import { generateId } from '@/utils/idGenerator'

/**
 * Biblioteca de imágenes en modo local (sin Supabase). Metadatos en un store de
 * IndexedDB; los bytes en un store aparte (dataURL keyed por id). El `ref` de
 * cada imagen es `local://<id>` y getImageData lo resuelve leyendo los bytes.
 */
const meta = localforage.createInstance({ name: 'flujo', storeName: 'imageLibrary' })
const bytes = localforage.createInstance({ name: 'flujo', storeName: 'imageBytes' })

const LOCAL_REF = 'local://'

export class LocalImageRepository implements IImageRepository {
  async getAll(): Promise<LibraryImage[]> {
    return (await meta.getItem<LibraryImage[]>('flujo:images')) ?? []
  }

  private async setAll(images: LibraryImage[]): Promise<void> {
    await meta.setItem('flujo:images', images)
  }

  async upload({ dataUrl, name, projectId, folderId }: {
    dataUrl: string; name: string; projectId: string | null; folderId: string | null
  }): Promise<LibraryImage> {
    const id = generateId('img')
    const mimeMatch = /^data:(.*?)[;,]/.exec(dataUrl)
    const now = new Date().toISOString()
    const image: LibraryImage = {
      id,
      name,
      projectId,
      folderId,
      mime: mimeMatch?.[1] ?? 'image/webp',
      size: Math.round((dataUrl.length * 3) / 4),
      ref: LOCAL_REF + id,
      createdAt: now,
      updatedAt: now,
    }
    await bytes.setItem(id, dataUrl)
    const all = await this.getAll()
    all.push(image)
    await this.setAll(all)
    return image
  }

  async rename(id: string, name: string): Promise<void> {
    const all = await this.getAll()
    const img = all.find((i) => i.id === id)
    if (img) { img.name = name; img.updatedAt = new Date().toISOString(); await this.setAll(all) }
  }

  async move(id: string, folderId: string | null): Promise<void> {
    const all = await this.getAll()
    const img = all.find((i) => i.id === id)
    if (img) { img.folderId = folderId; img.updatedAt = new Date().toISOString(); await this.setAll(all) }
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll()
    await this.setAll(all.filter((i) => i.id !== id))
    await bytes.removeItem(id)
  }

  async getImageData(image: LibraryImage): Promise<string | null> {
    if (image.ref.startsWith(LOCAL_REF)) return bytes.getItem<string>(image.ref.slice(LOCAL_REF.length))
    if (image.ref.startsWith('data:')) return image.ref
    return null
  }

  async getFolders(): Promise<ImageFolder[]> {
    return (await meta.getItem<ImageFolder[]>('flujo:imageFolders')) ?? []
  }

  async saveFolder(folder: ImageFolder): Promise<void> {
    const all = await this.getFolders()
    const idx = all.findIndex((f) => f.id === folder.id)
    if (idx >= 0) all[idx] = folder
    else all.push(folder)
    await meta.setItem('flujo:imageFolders', all)
  }

  async deleteFolder(id: string): Promise<void> {
    const all = await this.getFolders()
    await meta.setItem('flujo:imageFolders', all.filter((f) => f.id !== id))
    // Las imágenes de la carpeta quedan sueltas.
    const images = await this.getAll()
    let changed = false
    images.forEach((i) => { if (i.folderId === id) { i.folderId = null; changed = true } })
    if (changed) await this.setAll(images)
  }
}
