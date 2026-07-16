import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ImageFolder, LibraryImage } from '@/domain/types'
import { imageRepository } from '@/persistence'
import { generateDiagramId } from '@/utils/idGenerator'

interface ImageState {
  images: LibraryImage[]
  folders: ImageFolder[]
  loaded: boolean
  /** dataURL resuelto por id (bytes bajo demanda — solo se piden al ver la imagen). */
  resolved: Record<string, string>
  loadAll: () => Promise<void>
  upload: (params: { dataUrl: string; name: string; projectId: string | null; folderId: string | null }) => Promise<LibraryImage>
  rename: (id: string, name: string) => Promise<void>
  move: (id: string, folderId: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
  resolve: (id: string) => Promise<string | null>
  createFolder: (name: string, projectId: string | null) => Promise<string>
  renameFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  getById: (id: string) => LibraryImage | undefined
}

export const useImageStore = create<ImageState>()(
  immer((set, get) => ({
    images: [],
    folders: [],
    loaded: false,
    resolved: {},

    loadAll: async () => {
      const [images, folders] = await Promise.all([
        imageRepository.getAll(),
        imageRepository.getFolders(),
      ])
      set((s) => { s.images = images; s.folders = folders; s.loaded = true })
    },

    upload: async ({ dataUrl, name, projectId, folderId }) => {
      const image = await imageRepository.upload({ dataUrl, name, projectId, folderId })
      set((s) => {
        s.images.unshift(image)
        s.resolved[image.id] = dataUrl // ya tenemos los bytes; evita re-descarga
      })
      return image
    },

    rename: async (id, name) => {
      await imageRepository.rename(id, name)
      set((s) => { const i = s.images.find((x) => x.id === id); if (i) i.name = name })
    },

    move: async (id, folderId) => {
      await imageRepository.move(id, folderId)
      set((s) => { const i = s.images.find((x) => x.id === id); if (i) i.folderId = folderId })
    },

    remove: async (id) => {
      await imageRepository.delete(id)
      set((s) => { s.images = s.images.filter((x) => x.id !== id); delete s.resolved[id] })
    },

    resolve: async (id) => {
      const cached = get().resolved[id]
      if (cached) return cached
      const image = get().images.find((x) => x.id === id)
      if (!image) return null
      const data = await imageRepository.getImageData(image)
      if (data) set((s) => { s.resolved[id] = data })
      return data
    },

    createFolder: async (name, projectId) => {
      const folder: ImageFolder = {
        id: generateDiagramId(),
        name,
        projectId,
        createdAt: new Date().toISOString(),
      }
      await imageRepository.saveFolder(folder)
      set((s) => { s.folders.push(folder) })
      return folder.id
    },

    renameFolder: async (id, name) => {
      const folder = get().folders.find((f) => f.id === id)
      if (!folder) return
      await imageRepository.saveFolder({ ...folder, name })
      set((s) => { const f = s.folders.find((x) => x.id === id); if (f) f.name = name })
    },

    deleteFolder: async (id) => {
      await imageRepository.deleteFolder(id)
      set((s) => {
        s.folders = s.folders.filter((f) => f.id !== id)
        s.images.forEach((i) => { if (i.folderId === id) i.folderId = null })
      })
    },

    getById: (id) => get().images.find((x) => x.id === id),
  }))
)
