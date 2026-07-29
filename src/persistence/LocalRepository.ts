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
  showComments: true,
  diagramSort: { key: 'updated', dir: 'desc' },
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
  /** Lee TODOS los diagramas (incluye los de la papelera). Uso interno. */
  private async readDiagramsRaw(): Promise<Diagram[]> {
    const raw = (await store.getItem<Diagram[]>('flujo:diagrams')) ?? []
    return raw.map((d) => ({
      ...d,
      parentDiagramId: d.parentDiagramId ?? null,
      subProcessElementId: d.subProcessElementId ?? null,
      projectId: d.projectId ?? null,
      deletedAt: d.deletedAt ?? null,
    }))
  }

  async getAll(): Promise<Diagram[]> {
    return (await this.readDiagramsRaw()).filter((d) => !d.deletedAt)
  }

  async getById(id: string): Promise<Diagram | null> {
    const all = await this.getAll()
    return all.find((d) => d.id === id) ?? null
  }

  // expectedUpdatedAt se ignora en local: un solo dispositivo, sin concurrencia.
  async save(diagram: Diagram, _expectedUpdatedAt?: string): Promise<string> {
    const all = await this.readDiagramsRaw()
    const idx = all.findIndex((d) => d.id === diagram.id)
    if (idx >= 0) {
      all[idx] = diagram
    } else {
      all.push(diagram)
    }
    await store.setItem('flujo:diagrams', all)
    return diagram.updatedAt
  }

  async delete(id: string): Promise<void> {
    // Soft delete: marca deleted_at, conserva thumbnail.
    const now = new Date().toISOString()
    const all = await this.readDiagramsRaw()
    await store.setItem('flujo:diagrams', all.map((d) => (d.id === id ? { ...d, deletedAt: now } : d)))
  }

  async restore(id: string): Promise<void> {
    const all = await this.readDiagramsRaw()
    await store.setItem('flujo:diagrams', all.map((d) => (d.id === id ? { ...d, deletedAt: null } : d)))
  }

  async purge(id: string): Promise<void> {
    const all = await this.readDiagramsRaw()
    await store.setItem('flujo:diagrams', all.filter((d) => d.id !== id))
    await thumbStore.removeItem(id)
  }

  async getThumbnail(id: string): Promise<string | null> {
    return thumbStore.getItem<string>(id)
  }

  async saveThumbnail(id: string, dataUrl: string): Promise<string | null> {
    await thumbStore.setItem(id, dataUrl)
    return null // sin trigger de versión en local
  }

  async setDiagramName(id: string, name: string): Promise<string | null> {
    const all = await this.readDiagramsRaw()
    const idx = all.findIndex((d) => d.id === id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], name }
      await store.setItem('flujo:diagrams', all)
    }
    return null
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
    // Soft delete del árbol (padre + subprocesos), conserva thumbnails.
    const raw = await this.readDiagramsRaw()
    const now = new Date().toISOString()
    const collectIds = (parentId: string): string[] => {
      const result: string[] = [parentId]
      for (const child of raw.filter((d) => d.parentDiagramId === parentId)) {
        result.push(...collectIds(child.id))
      }
      return result
    }
    const ids = new Set(collectIds(id))
    await store.setItem('flujo:diagrams', raw.map((d) => (ids.has(d.id) ? { ...d, deletedAt: now } : d)))
  }

  // ── Proyectos (modo local: persistencia básica en IndexedDB) ──
  private async readProjectsRaw(): Promise<Project[]> {
    return ((await store.getItem<Project[]>('flujo:projects')) ?? []).map((p) => ({ ...p, deletedAt: p.deletedAt ?? null }))
  }

  async getProjects(): Promise<Project[]> {
    return (await this.readProjectsRaw()).filter((p) => !p.deletedAt)
  }

  async saveProject(project: Project): Promise<void> {
    const all = await this.getProjects()
    const idx = all.findIndex((p) => p.id === project.id)
    if (idx >= 0) all[idx] = project
    else all.push(project)
    await store.setItem('flujo:projects', all)
  }

  async deleteProject(id: string): Promise<void> {
    // Soft delete: proyecto + sus diagramas a la papelera juntos.
    const now = new Date().toISOString()
    const projects = await this.readProjectsRaw()
    await store.setItem('flujo:projects', projects.map((p) => (p.id === id ? { ...p, deletedAt: now } : p)))
    const diagrams = await this.readDiagramsRaw()
    await store.setItem('flujo:diagrams', diagrams.map((d) => (d.projectId === id && !d.deletedAt ? { ...d, deletedAt: now } : d)))
  }

  async restoreProject(id: string): Promise<void> {
    const projects = await this.readProjectsRaw()
    await store.setItem('flujo:projects', projects.map((p) => (p.id === id ? { ...p, deletedAt: null } : p)))
    const diagrams = await this.readDiagramsRaw()
    await store.setItem('flujo:diagrams', diagrams.map((d) => (d.projectId === id ? { ...d, deletedAt: null } : d)))
  }

  async purgeProject(id: string): Promise<void> {
    const diagrams = await this.readDiagramsRaw()
    const toRemove = diagrams.filter((d) => d.projectId === id).map((d) => d.id)
    await store.setItem('flujo:diagrams', diagrams.filter((d) => d.projectId !== id))
    for (const did of toRemove) await thumbStore.removeItem(did)
    const projects = await this.readProjectsRaw()
    await store.setItem('flujo:projects', projects.filter((p) => p.id !== id))
  }

  async getTrash(): Promise<{ diagrams: Diagram[]; projects: Project[] }> {
    const diagrams = (await this.readDiagramsRaw()).filter((d) => !!d.deletedAt)
    const projects = (await this.readProjectsRaw()).filter((p) => !!p.deletedAt)
    return { diagrams, projects }
  }

  async purgeAll(): Promise<void> {
    const diagrams = await this.readDiagramsRaw()
    const trashedIds = diagrams.filter((d) => d.deletedAt).map((d) => d.id)
    await store.setItem('flujo:diagrams', diagrams.filter((d) => !d.deletedAt))
    for (const id of trashedIds) await thumbStore.removeItem(id)
    const projects = await this.readProjectsRaw()
    await store.setItem('flujo:projects', projects.filter((p) => !p.deletedAt))
  }

  async setDiagramProject(diagramId: string, projectId: string | null): Promise<string | null> {
    const all = await this.readDiagramsRaw()
    const idx = all.findIndex((d) => d.id === diagramId)
    if (idx >= 0) {
      all[idx] = { ...all[idx], projectId }
      await store.setItem('flujo:diagrams', all)
    }
    return null
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
