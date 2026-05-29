import localforage from 'localforage'
import type { IDiagramRepository } from './IDiagramRepository'
import type { Diagram, Folder, Project, UserPreferences } from '@/domain/types'

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
    const raw = (await store.getItem<Diagram[]>('flujo:diagrams')) ?? []
    return raw.map((d) => ({
      ...d,
      parentDiagramId: d.parentDiagramId ?? null,
      subProcessElementId: d.subProcessElementId ?? null,
      projectId: d.projectId ?? null,
    }))
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

  private subProcKey(parentId: string, elementId: string): string {
    return `subproc:${parentId}:${elementId}`
  }

  async getSubProcessThumbnail(parentId: string, elementId: string): Promise<string | null> {
    return thumbStore.getItem<string>(this.subProcKey(parentId, elementId))
  }

  async saveSubProcessThumbnail(parentId: string, elementId: string, dataUrl: string): Promise<void> {
    await thumbStore.setItem(this.subProcKey(parentId, elementId), dataUrl)
  }

  async deleteSubProcessThumbnail(parentId: string, elementId: string): Promise<void> {
    await thumbStore.removeItem(this.subProcKey(parentId, elementId))
  }

  async deleteWithChildren(id: string): Promise<void> {
    const collectIds = async (parentId: string): Promise<string[]> => {
      const all = await this.getAll()
      const result: string[] = [parentId]
      const children = all.filter((d) => d.parentDiagramId === parentId)
      for (const child of children) {
        result.push(...await collectIds(child.id))
      }
      return result
    }
    const idsToDelete = await collectIds(id)
    const all = await this.getAll()
    await store.setItem('flujo:diagrams', all.filter((d) => !idsToDelete.includes(d.id)))
    for (const did of idsToDelete) {
      await thumbStore.removeItem(did)
    }
  }

  // ── Proyectos (modo local: persistencia básica en IndexedDB) ──
  async getProjects(): Promise<Project[]> {
    return (await store.getItem<Project[]>('flujo:projects')) ?? []
  }

  async saveProject(project: Project): Promise<void> {
    const all = await this.getProjects()
    const idx = all.findIndex((p) => p.id === project.id)
    if (idx >= 0) all[idx] = project
    else all.push(project)
    await store.setItem('flujo:projects', all)
  }

  async deleteProject(id: string): Promise<void> {
    const all = await this.getProjects()
    await store.setItem('flujo:projects', all.filter((p) => p.id !== id))
    // Diagramas del proyecto quedan sueltos.
    const diagrams = await this.getAll()
    const updated = diagrams.map((d) => (d.projectId === id ? { ...d, projectId: null } : d))
    await store.setItem('flujo:diagrams', updated)
  }

  async setDiagramProject(diagramId: string, projectId: string | null): Promise<void> {
    const all = await this.getAll()
    const idx = all.findIndex((d) => d.id === diagramId)
    if (idx >= 0) {
      all[idx] = { ...all[idx], projectId }
      await store.setItem('flujo:diagrams', all)
    }
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
