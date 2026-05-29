import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { IDiagramRepository } from './IDiagramRepository'
import type { Diagram, Folder, Project, UserPreferences } from '@/domain/types'
import { LocalRepository } from './LocalRepository'

const THUMB_BUCKET = 'thumbnails'
const thumbPath = (id: string) => `${id}/thumb`

interface DiagramRow {
  id: string
  owner_id: string
  folder_id: string | null
  name: string
  current_xml: string
  element_count: number
  thumbnail_path: string | null
  schema_version: number
  parent_diagram_id: string | null
  sub_process_element_id: string | null
  project_id: string | null
  created_at: string
  updated_at: string
}

function rowToDiagram(r: DiagramRow): Diagram {
  return {
    id: r.id,
    name: r.name,
    xml: r.current_xml,
    thumbnail: null, // se obtiene aparte vía getThumbnail()
    folderId: r.folder_id,
    projectId: r.project_id ?? null,
    elementCount: r.element_count,
    schemaVersion: r.schema_version,
    parentDiagramId: r.parent_diagram_id ?? null,
    subProcessElementId: r.sub_process_element_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/png'
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Repositorio sobre Supabase (Postgres + Storage). Las preferencias se mantienen
 * locales por dispositivo (se delega en LocalRepository), todo lo demás va a la nube.
 */
export class SupabaseRepository implements IDiagramRepository {
  private local = new LocalRepository()

  private get sb(): SupabaseClient {
    if (!supabase) throw new Error('Supabase no configurado')
    return supabase
  }

  private async uid(): Promise<string> {
    const { data, error } = await this.sb.auth.getUser()
    if (error || !data.user) throw new Error('No autenticado')
    return data.user.id
  }

  async getAll(): Promise<Diagram[]> {
    const { data, error } = await this.sb
      .from('diagrams')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data as DiagramRow[]).map(rowToDiagram)
  }

  async getById(id: string): Promise<Diagram | null> {
    const { data, error } = await this.sb
      .from('diagrams')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data ? rowToDiagram(data as DiagramRow) : null
  }

  async save(diagram: Diagram): Promise<void> {
    // No usamos upsert: en un UPDATE incluiría owner_id y un editor podría
    // robar la propiedad. Distinguimos insert (con owner) de update (sin owner).
    const { data: existing, error: selErr } = await this.sb
      .from('diagrams')
      .select('id')
      .eq('id', diagram.id)
      .maybeSingle()
    if (selErr) throw selErr

    if (existing) {
      const { error } = await this.sb
        .from('diagrams')
        .update({
          folder_id: diagram.folderId,
          name: diagram.name,
          current_xml: diagram.xml,
          element_count: diagram.elementCount,
          schema_version: diagram.schemaVersion,
        })
        .eq('id', diagram.id)
      if (error) throw error
    } else {
      const ownerId = await this.uid()
      const { error } = await this.sb.from('diagrams').insert({
        id: diagram.id,
        owner_id: ownerId,
        folder_id: diagram.folderId,
        name: diagram.name,
        current_xml: diagram.xml,
        element_count: diagram.elementCount,
        schema_version: diagram.schemaVersion,
        parent_diagram_id: diagram.parentDiagramId ?? null,
        sub_process_element_id: diagram.subProcessElementId ?? null,
        project_id: diagram.projectId ?? null,
        created_at: diagram.createdAt,
        updated_at: diagram.updatedAt,
      })
      if (error) throw error
    }
  }

  // ── Proyectos ──────────────────────────────────────────────────
  async getProjects(): Promise<Project[]> {
    const { data, error } = await this.sb
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data as { id: string; owner_id: string; name: string; created_at: string; updated_at: string }[]).map((p) => ({
      id: p.id,
      name: p.name,
      ownerId: p.owner_id,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }))
  }

  async saveProject(project: Project): Promise<void> {
    const { data: existing, error: selErr } = await this.sb
      .from('projects')
      .select('id')
      .eq('id', project.id)
      .maybeSingle()
    if (selErr) throw selErr
    if (existing) {
      const { error } = await this.sb.from('projects').update({ name: project.name }).eq('id', project.id)
      if (error) throw error
    } else {
      const ownerId = await this.uid()
      const { error } = await this.sb.from('projects').insert({
        id: project.id,
        owner_id: ownerId,
        name: project.name,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      })
      if (error) throw error
    }
  }

  async deleteProject(id: string): Promise<void> {
    // Los diagramas quedan sueltos (FK ON DELETE SET NULL), no se borran.
    const { error } = await this.sb.from('projects').delete().eq('id', id)
    if (error) throw error
  }

  async setDiagramProject(diagramId: string, projectId: string | null): Promise<void> {
    const { error } = await this.sb.from('diagrams').update({ project_id: projectId }).eq('id', diagramId)
    if (error) throw error
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.sb.from('diagrams').delete().eq('id', id)
    if (error) throw error
    await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(id)])
  }

  async getThumbnail(id: string): Promise<string | null> {
    const { data, error } = await this.sb.storage.from(THUMB_BUCKET).download(thumbPath(id))
    if (error || !data) return null
    try {
      return await blobToDataUrl(data)
    } catch {
      return null
    }
  }

  async saveThumbnail(id: string, dataUrl: string): Promise<void> {
    // dataUrl vacío = limpiar thumbnail (diagramStore pasa '' para null).
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(id)])
      await this.sb.from('diagrams').update({ thumbnail_path: null }).eq('id', id)
      return
    }
    const blob = dataUrlToBlob(dataUrl)
    const { error } = await this.sb.storage
      .from(THUMB_BUCKET)
      .upload(thumbPath(id), blob, { upsert: true, contentType: blob.type })
    if (error) throw error
    await this.sb.from('diagrams').update({ thumbnail_path: thumbPath(id) }).eq('id', id)
  }

  // ── Thumbnails de subprocesos (overlay) ──
  // Path en Storage: '<parentId>/subproc/<elementId>' → 1er segmento = parentId (RLS).
  private subProcPath(parentId: string, elementId: string): string {
    return `${parentId}/subproc/${elementId}`
  }

  async getSubProcessThumbnail(parentId: string, elementId: string): Promise<string | null> {
    const { data, error } = await this.sb.storage
      .from(THUMB_BUCKET)
      .download(this.subProcPath(parentId, elementId))
    if (error || !data) return null
    try {
      return await blobToDataUrl(data)
    } catch {
      return null
    }
  }

  async saveSubProcessThumbnail(parentId: string, elementId: string, dataUrl: string): Promise<void> {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      await this.sb.storage.from(THUMB_BUCKET).remove([this.subProcPath(parentId, elementId)])
      return
    }
    const blob = dataUrlToBlob(dataUrl)
    const { error } = await this.sb.storage
      .from(THUMB_BUCKET)
      .upload(this.subProcPath(parentId, elementId), blob, { upsert: true, contentType: blob.type })
    if (error) throw error
  }

  async deleteSubProcessThumbnail(parentId: string, elementId: string): Promise<void> {
    await this.sb.storage.from(THUMB_BUCKET).remove([this.subProcPath(parentId, elementId)])
  }

  async deleteWithChildren(id: string): Promise<void> {
    // El FK parent_diagram_id es ON DELETE CASCADE: borrar el padre elimina
    // recursivamente a los descendientes en la BD.
    const { error } = await this.sb.from('diagrams').delete().eq('id', id)
    if (error) throw error
    await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(id)])
  }

  async getFolders(): Promise<Folder[]> {
    const { data, error } = await this.sb
      .from('folders')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as { id: string; name: string; created_at: string }[]).map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.created_at,
    }))
  }

  async saveFolder(folder: Folder): Promise<void> {
    const ownerId = await this.uid()
    const { error } = await this.sb.from('folders').upsert(
      { id: folder.id, owner_id: ownerId, name: folder.name, created_at: folder.createdAt },
      { onConflict: 'id' }
    )
    if (error) throw error
  }

  async deleteFolder(id: string): Promise<void> {
    const { error } = await this.sb.from('folders').delete().eq('id', id)
    if (error) throw error
  }

  // Preferencias: locales por dispositivo.
  getPreferences(): Promise<UserPreferences> {
    return this.local.getPreferences()
  }

  savePreferences(prefs: UserPreferences): Promise<void> {
    return this.local.savePreferences(prefs)
  }
}
