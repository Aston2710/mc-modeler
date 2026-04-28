import localforage from 'localforage'
import type { IDiagramRepository } from './IDiagramRepository'
import type { Diagram, Folder, UserPreferences } from '@/domain/types'

const SCHEMA_VERSION = 1

const DEFAULT_PREFS: UserPreferences = {
  language: 'es',
  theme: 'light',
  gridEnabled: true,
  gridSize: 10,
  snapToGrid: true,
  autoSaveInterval: 30,
  lastOpenedDiagramId: null,
  paletteMode: 'grid',
}

const store = localforage.createInstance({
  name: 'flujo',
  storeName: 'main',
})

const thumbStore = localforage.createInstance({
  name: 'flujo',
  storeName: 'thumbnails',
})

export class LocalRepository implements IDiagramRepository {
  async getAll(): Promise<Diagram[]> {
    return (await store.getItem<Diagram[]>('flujo:diagrams')) ?? []
  }

  async getById(id: string): Promise<Diagram | null> {
    const all = await this.getAll()
    return all.find((d) => d.id === id) ?? null
  }

  async save(diagram: Diagram): Promise<void> {
    const all = await this.getAll()
    const idx = all.findIndex((d) => d.id === diagram.id)
    if (idx >= 0) {
      all[idx] = diagram
    } else {
      all.push(diagram)
    }
    await store.setItem('flujo:diagrams', all)
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll()
    await store.setItem(
      'flujo:diagrams',
      all.filter((d) => d.id !== id)
    )
    await thumbStore.removeItem(id)
  }

  async getThumbnail(id: string): Promise<string | null> {
    return thumbStore.getItem<string>(id)
  }

  async saveThumbnail(id: string, dataUrl: string): Promise<void> {
    await thumbStore.setItem(id, dataUrl)
  }

  async getFolders(): Promise<Folder[]> {
    return (await store.getItem<Folder[]>('flujo:folders')) ?? []
  }

  async saveFolder(folder: Folder): Promise<void> {
    const all = await this.getFolders()
    const idx = all.findIndex((f) => f.id === folder.id)
    if (idx >= 0) {
      all[idx] = folder
    } else {
      all.push(folder)
    }
    await store.setItem('flujo:folders', all)
  }

  async deleteFolder(id: string): Promise<void> {
    const all = await this.getFolders()
    await store.setItem(
      'flujo:folders',
      all.filter((f) => f.id !== id)
    )
  }

  async getPreferences(): Promise<UserPreferences> {
    const prefs = await store.getItem<UserPreferences>('flujo:preferences')
    return { ...DEFAULT_PREFS, ...prefs }
  }

  async savePreferences(prefs: UserPreferences): Promise<void> {
    await store.setItem('flujo:preferences', prefs)
  }
}

void SCHEMA_VERSION
