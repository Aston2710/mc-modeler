import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ImageFolder, LibraryImage } from '@/domain/types'
import { imageRepository } from '@/persistence'
import { supabase } from '@/lib/supabase'
import { generateDiagramId } from '@/utils/idGenerator'

// Estado del canal Realtime fuera del store (no serializable en immer).
let rtChannel: RealtimeChannel | null = null
let rtDebounce: ReturnType<typeof setTimeout> | null = null

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
  startRealtime: () => void
  stopRealtime: () => void
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

    // Realtime: cualquier INSERT/UPDATE/DELETE en images/image_folders (de este u
    // otro colaborador) refresca el catálogo — con debounce para agrupar ráfagas.
    // RLS aplica al refetch, así que solo trae lo accesible. El caché `resolved`
    // (bytes) se conserva; las imágenes nuevas se resuelven bajo demanda.
    startRealtime: () => {
      if (!supabase || rtChannel) return
      const bump = () => {
        if (rtDebounce) clearTimeout(rtDebounce)
        rtDebounce = setTimeout(() => { void get().loadAll() }, 300)
      }
      const ch = supabase.channel('image-library')
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'images' }, bump)
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'image_folders' }, bump)
      ch.subscribe()
      rtChannel = ch
    },

    stopRealtime: () => {
      if (rtDebounce) { clearTimeout(rtDebounce); rtDebounce = null }
      if (rtChannel && supabase) { void supabase.removeChannel(rtChannel) }
      rtChannel = null
    },
  }))
)
