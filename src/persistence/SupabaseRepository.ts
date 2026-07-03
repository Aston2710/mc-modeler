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
  const commaIdx = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, commaIdx)
  const payload = dataUrl.slice(commaIdx + 1)
  const mime = /:(.*?)[;,]/.exec(header)?.[1] ?? 'image/png'

  // Los thumbnails de bpmn-js son SVG URL-encoded (data:image/svg+xml;...,%3Csvg)
  // — NO base64. Otros (PNG/WebP) sí son base64. Detectar por el header.
  if (header.includes(';base64')) {
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  // URL-encoded (texto, p. ej. SVG)
  const text = decodeURIComponent(payload)
  return new Blob([text], { type: mime })
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
  // Cache de thumbnail_path por diagrama: evita pedir a Storage (GET 400)
  // los thumbnails de diagramas que aún no tienen ninguno.
  private thumbPaths = new Map<string, string | null>()
  // Cache del dataURL del thumbnail por diagrama. Clave para el rendimiento Y el
  // parpadeo: getThumbnail devuelve SIEMPRE el mismo string por id (identidad
  // estable) → el <img> no recarga; y no se re-descarga de Storage en cada carga.
  // Se invalida en saveThumbnail (nuevo dataURL) y al borrar.
  private thumbCache = new Map<string, string | null>()

  private get sb(): SupabaseClient {
    if (!supabase) throw new Error('Supabase no configurado')
    return supabase
  }

  private async uid(): Promise<string> {
    const { data, error } = await this.sb.auth.getUser()
    if (error || !data.user) throw new Error('No autenticado')
    return data.user.id
  }

  // Columnas de la LISTA — NUNCA current_xml (puede pesar cientos de KB por
  // diagrama; con 100+ diagramas eran MBs en cada carga de la lista). El XML se
  // trae bajo demanda al abrir un diagrama (getById). Ver diagramStore.ensureXml.
  private static readonly LIST_COLUMNS =
    'id, owner_id, folder_id, name, element_count, thumbnail_path, schema_version, parent_diagram_id, sub_process_element_id, project_id, created_at, updated_at'

  async getAll(): Promise<Diagram[]> {
    const { data, error } = await this.sb
      .from('diagrams')
      .select(SupabaseRepository.LIST_COLUMNS)
      .order('updated_at', { ascending: false })
    if (error) throw error
    const rows = data as unknown as Omit<DiagramRow, 'current_xml'>[]
    rows.forEach((r) => this.thumbPaths.set(r.id, r.thumbnail_path ?? null))
    // xml queda vacío en la lista; se hidrata al abrir (getById).
    return rows.map((r) => rowToDiagram({ ...r, current_xml: '' } as DiagramRow))
  }

  async getById(id: string): Promise<Diagram | null> {
    const { data, error } = await this.sb
      .from('diagrams')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (data) this.thumbPaths.set((data as DiagramRow).id, (data as DiagramRow).thumbnail_path ?? null)
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
    // Identidad estable + sin re-descarga: si ya lo resolvimos, devolver el MISMO
    // string (evita recargar el <img> = parpadeo, y evita el GET a Storage).
    if (this.thumbCache.has(id)) return this.thumbCache.get(id) ?? null
    // Si sabemos que este diagrama no tiene thumbnail, no llamamos a Storage
    // (evita el GET 400 "Object not found" y su ruido en consola).
    if (this.thumbPaths.has(id) && !this.thumbPaths.get(id)) {
      this.thumbCache.set(id, null)
      return null
    }
    const { data, error } = await this.sb.storage.from(THUMB_BUCKET).download(thumbPath(id))
    if (error || !data) {
      // BD decía que había thumbnail pero el objeto no existe (inconsistencia
      // BD↔Storage → GET 400). Cacheamos el negativo para no reintentar y
      // limpiamos el thumbnail_path huérfano (best-effort; cosmético).
      this.thumbPaths.set(id, null)
      this.thumbCache.set(id, null)
      void this.sb.from('diagrams').update({ thumbnail_path: null }).eq('id', id)
      return null
    }
    try {
      const url = await blobToDataUrl(data)
      this.thumbCache.set(id, url)
      return url
    } catch {
      this.thumbCache.set(id, null)
      return null
    }
  }

  async saveThumbnail(id: string, dataUrl: string): Promise<void> {
    // dataUrl vacío = limpiar thumbnail (diagramStore pasa '' para null).
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(id)])
      await this.sb.from('diagrams').update({ thumbnail_path: null }).eq('id', id)
      this.thumbPaths.set(id, null)
      this.thumbCache.set(id, null)
      return
    }
    const blob = dataUrlToBlob(dataUrl)
    const { error } = await this.sb.storage
      .from(THUMB_BUCKET)
      .upload(thumbPath(id), blob, { upsert: true, contentType: blob.type })
    if (error) throw error
    await this.sb.from('diagrams').update({ thumbnail_path: thumbPath(id) }).eq('id', id)
    this.thumbPaths.set(id, thumbPath(id))
    // Actualizar el cache con el dataURL recién guardado (identidad estable nueva).
    this.thumbCache.set(id, dataUrl)
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
