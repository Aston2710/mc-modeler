import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { IDiagramRepository } from './IDiagramRepository'
import { DiagramConflictError } from './IDiagramRepository'
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
  deleted_at?: string | null
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
    deletedAt: r.deleted_at ?? null,
  }
}

interface ProjectRow {
  id: string
  owner_id: string
  name: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

function rowToProject(p: ProjectRow): Project {
  return {
    id: p.id,
    name: p.name,
    ownerId: p.owner_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    deletedAt: p.deleted_at ?? null,
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

/**
 * Techo del bucket `thumbnails` en Storage (migracion 20260813120000).
 * Solo se usa para diagnosticar: la verdad la impone Storage, no el cliente.
 */
const THUMB_SIZE_LIMIT_BYTES = 5 * 1024 * 1024

/**
 * Vida de las URLs firmadas de thumbnails: 10 minutos.
 *
 * Corta a propósito. Pintar una portada es cosa de segundos, así que este
 * plazo sobra para el uso legítimo y deja casi sin valor a una URL que se
 * filtre: para cuando alguien la reenvíe, ya no sirve. Es la contrapartida
 * aceptada al pasar de descargas autenticadas a URLs (PLAN-012).
 */
/**
 * Vida de la URL firmada de un thumbnail: **90 minutos**.
 *
 * Es un compromiso entre dos cosas, y el equilibrio lo fijó el usuario el
 * 2026-08-22:
 *
 * - **Caché.** La caché HTTP del navegador se indexa por URL, así que cada
 *   re-firma produce una URL nueva y una descarga nueva. Con 10 minutos —el
 *   valor original— cualquier visita separada por más de 10 minutos volvía a
 *   bajar la portada entera, y eso tira a la basura buena parte de la ganancia
 *   de PLAN-012. En una cuenta gratuita, donde el recurso escaso es el egress,
 *   la cacheabilidad vale más que los bytes.
 * - **Exposición.** Una URL firmada filtrada sirve hasta que caduca. 90 minutos
 *   sigue siendo efímero, y el daño es menor que antes: rasterizado a WebP el
 *   thumbnail ya no lleva dentro el texto del proceso extraíble, solo píxeles.
 */
const THUMB_URL_TTL_SECONDS = 90 * 60
/** Se re-firma con antelación para que ninguna URL caduque estando en uso. */
const THUMB_URL_RENEW_MARGIN_SECONDS = 5 * 60

/**
 * Enriquece el error de subida de un thumbnail con el dato que hace falta para
 * decidir: cuanto pesaba.
 *
 * Un thumbnail que no cabe falla en silencio — el diagrama se guarda igual y
 * el usuario solo ve una portada sin miniatura. Sin el tamaño en el mensaje no
 * hay forma de saber si el techo se quedo corto otra vez o si el fallo era de
 * red, y acabariamos subiendo el limite a ciegas. PLAN-012 (thumbnails a WebP)
 * deberia hacer esto irrelevante.
 */
/** Error de subida de thumbnail, con el original adjunto para depurar. */
export interface ThumbUploadError extends Error {
  /** El error tal cual lo devolvio Storage. No se usa `cause`: exige ES2022. */
  originalError: unknown
  /** Tamaño del blob que se intento subir. */
  sizeBytes: number
  /** true si el fallo se atribuye al techo del bucket. */
  tooBig: boolean
}

export function describeThumbUploadError(error: unknown, sizeBytes: number): ThumbUploadError {
  const message = error instanceof Error ? error.message : String(error)
  const kb = Math.round(sizeBytes / 1024)
  const tooBig =
    sizeBytes > THUMB_SIZE_LIMIT_BYTES ||
    /maximum allowed size|payload too large|entity too large|413/i.test(message)

  const detail = tooBig
    ? `thumbnail de ${kb} kB supera el techo del bucket (${THUMB_SIZE_LIMIT_BYTES / 1024 / 1024} MB)`
    : `thumbnail de ${kb} kB`

  const wrapped = new Error(`[thumbnail] ${detail}: ${message}`) as ThumbUploadError
  wrapped.originalError = error
  wrapped.sizeBytes = sizeBytes
  wrapped.tooBig = tooBig
  return wrapped
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
  // Cache de URLs firmadas (PLAN-012): id → { url, expira }. Se re-firma al
  // caducar. Es lo que permite que la portada haga UNA llamada en vez de una
  // descarga autenticada por tarjeta.
  private signedThumbs = new Map<string, { url: string; expiresAt: number }>()

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
    'id, owner_id, folder_id, name, element_count, thumbnail_path, schema_version, parent_diagram_id, sub_process_element_id, project_id, created_at, updated_at, deleted_at'

  async getAll(): Promise<Diagram[]> {
    const { data, error } = await this.sb
      .from('diagrams')
      .select(SupabaseRepository.LIST_COLUMNS)
      .is('deleted_at', null)
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

  async save(diagram: Diagram, expectedUpdatedAt?: string): Promise<string> {
    // No usamos upsert: en un UPDATE incluiría owner_id y un editor podría
    // robar la propiedad. Distinguimos insert (con owner) de update (sin owner).
    const { data: existing, error: selErr } = await this.sb
      .from('diagrams')
      .select('id')
      .eq('id', diagram.id)
      .maybeSingle()
    if (selErr) throw selErr

    if (existing) {
      let q = this.sb
        .from('diagrams')
        .update({
          folder_id: diagram.folderId,
          name: diagram.name,
          current_xml: diagram.xml,
          element_count: diagram.elementCount,
          schema_version: diagram.schemaVersion,
        })
        .eq('id', diagram.id)
      // Control optimista (CAS): solo actualiza si el updated_at en DB coincide con
      // el esperado. El trigger diagrams_set_updated_at pone updated_at=now() en el
      // UPDATE, así que leemos el nuevo valor de vuelta (server-authoritative).
      if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt)
      const { data, error } = await q.select('updated_at').maybeSingle()
      if (error) throw error
      if (!data) {
        // 0 filas afectadas: con CAS = conflicto (otro escribió antes de nosotros).
        if (expectedUpdatedAt) throw new DiagramConflictError(diagram.id)
        // Sin CAS, 0 filas = el diagrama ya no existe (borrado) → devolver el propio.
        return diagram.updatedAt
      }
      return (data as { updated_at: string }).updated_at
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
      return diagram.updatedAt
    }
  }

  // ── Proyectos ──────────────────────────────────────────────────
  async getProjects(): Promise<Project[]> {
    const { data, error } = await this.sb
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data as ProjectRow[]).map(rowToProject)
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
    // Soft delete: el proyecto y sus diagramas van a la papelera juntos.
    const now = new Date().toISOString()
    const { error } = await this.sb.from('projects').update({ deleted_at: now }).eq('id', id)
    if (error) throw error
    // Marca los diagramas del proyecto que aún no estén borrados.
    const { error: dErr } = await this.sb
      .from('diagrams').update({ deleted_at: now }).eq('project_id', id).is('deleted_at', null)
    if (dErr) throw dErr
  }

  async restoreProject(id: string): Promise<void> {
    const { error } = await this.sb.from('projects').update({ deleted_at: null }).eq('id', id)
    if (error) throw error
    const { error: dErr } = await this.sb
      .from('diagrams').update({ deleted_at: null }).eq('project_id', id).not('deleted_at', 'is', null)
    if (dErr) throw dErr
  }

  async purgeProject(id: string): Promise<void> {
    // Borrado definitivo: primero los diagramas del proyecto (cascada de hijos por FK),
    // luego el proyecto. Best-effort en thumbnails.
    const { data } = await this.sb.from('diagrams').select('id').eq('project_id', id)
    const ids = (data as { id: string }[] | null)?.map((r) => r.id) ?? []
    for (const did of ids) {
      await this.sb.from('diagrams').delete().eq('id', did)
      await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(did)])
    }
    const { error } = await this.sb.from('projects').delete().eq('id', id)
    if (error) throw error
  }

  async getTrash(): Promise<{ diagrams: Diagram[]; projects: Project[] }> {
    const [dRes, pRes] = await Promise.all([
      this.sb.from('diagrams').select(SupabaseRepository.LIST_COLUMNS)
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      this.sb.from('projects').select('*')
        .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])
    if (dRes.error) throw dRes.error
    if (pRes.error) throw pRes.error
    const diagrams = (dRes.data as unknown as Omit<DiagramRow, 'current_xml'>[])
      .map((r) => rowToDiagram({ ...r, current_xml: '' } as DiagramRow))
    const projects = (pRes.data as ProjectRow[]).map(rowToProject)
    return { diagrams, projects }
  }

  async purgeAll(): Promise<void> {
    // Un DELETE por tabla (eficiente). Los thumbnails se limpian por lote.
    const { data } = await this.sb.from('diagrams').select('id').not('deleted_at', 'is', null)
    const ids = (data as { id: string }[] | null)?.map((r) => r.id) ?? []
    const { error } = await this.sb.from('diagrams').delete().not('deleted_at', 'is', null)
    if (error) throw error
    if (ids.length) await this.sb.storage.from(THUMB_BUCKET).remove(ids.map((id) => thumbPath(id)))
    const { error: pErr } = await this.sb.from('projects').delete().not('deleted_at', 'is', null)
    if (pErr) throw pErr
  }

  async setDiagramProject(diagramId: string, projectId: string | null): Promise<string | null> {
    const { data, error } = await this.sb
      .from('diagrams').update({ project_id: projectId }).eq('id', diagramId)
      .select('updated_at').maybeSingle()
    if (error) throw error
    return (data as { updated_at: string } | null)?.updated_at ?? null
  }

  async setDiagramName(id: string, name: string): Promise<string | null> {
    // Update dirigido: NUNCA current_xml (renombrar con save() escribiría el XML
    // en memoria sin CAS → clobber del trabajo de otro colaborador).
    const { data, error } = await this.sb
      .from('diagrams').update({ name }).eq('id', id)
      .select('updated_at').maybeSingle()
    if (error) throw error
    return (data as { updated_at: string } | null)?.updated_at ?? null
  }

  async delete(id: string): Promise<void> {
    // Soft delete: a la papelera. Se conserva el thumbnail para restaurar.
    const { error } = await this.sb.from('diagrams').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  }

  async restore(id: string): Promise<void> {
    const { error } = await this.sb.from('diagrams').update({ deleted_at: null }).eq('id', id)
    if (error) throw error
  }

  async purge(id: string): Promise<void> {
    // Borrado DEFINITIVO (cascada de hijos por FK parent_diagram_id) + thumbnail.
    const { error } = await this.sb.from('diagrams').delete().eq('id', id)
    if (error) throw error
    await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(id)])
  }

  /**
   * Firma en lote las rutas de los thumbnails pedidos (PLAN-012 paso 3).
   *
   * Antes, la portada resolvía cada miniatura por separado: una descarga
   * autenticada más una conversión a base64 por tarjeta. Con 78 tarjetas eran
   * 78 peticiones al hilo principal y ~4 MB, y el base64 infla un 33 % y se
   * quedaba retenido en memoria toda la sesión.
   *
   * `createSignedUrls` acepta N rutas y devuelve N URLs en **una** llamada. El
   * `<img>` apunta a una URL real, así que el navegador descarga en paralelo,
   * usa su propia caché y libera la memoria cuando quiere.
   *
   * SEGURIDAD. El bucket sigue privado: firmar aplica las mismas políticas de
   * siempre, así que solo se obtienen URLs de diagramas a los que ya se tiene
   * acceso. La caducidad es corta a propósito — lo justo para pintar la
   * portada, de modo que una URL filtrada quede inservible enseguida.
   */
  async getThumbnailUrls(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (ids.length === 0) return out

    const now = Date.now()
    const pending: string[] = []

    for (const id of ids) {
      // Ya sabemos que no tiene thumbnail: no gastar una firma.
      if (this.thumbPaths.has(id) && !this.thumbPaths.get(id)) continue
      const cached = this.signedThumbs.get(id)
      if (cached && cached.expiresAt > now) {
        out.set(id, cached.url)
        continue
      }
      pending.push(id)
    }

    if (pending.length === 0) return out

    const { data, error } = await this.sb.storage
      .from(THUMB_BUCKET)
      .createSignedUrls(pending.map(thumbPath), THUMB_URL_TTL_SECONDS)

    if (error || !data) return out

    // El orden de la respuesta sigue al de la petición, pero se empareja por
    // `path` para no depender de ello.
    const byPath = new Map<string, string>()
    for (const row of data) {
      if (row.signedUrl && !row.error) byPath.set(row.path ?? '', row.signedUrl)
    }

    // Margen de seguridad: se re-firma un poco antes de la caducidad real, para
    // que ninguna URL entregada expire mientras el navegador la está usando.
    const expiresAt = now + (THUMB_URL_TTL_SECONDS - THUMB_URL_RENEW_MARGIN_SECONDS) * 1000

    for (const id of pending) {
      const url = byPath.get(thumbPath(id))
      if (!url) {
        // Sin firma: el objeto no existe. Recordarlo evita reintentar en cada
        // carga de portada.
        this.thumbPaths.set(id, null)
        continue
      }
      this.signedThumbs.set(id, { url, expiresAt })
      out.set(id, url)
    }

    return out
  }

  /**
   * Re-firma el thumbnail de un diagrama tirando lo cacheado (PLAN-012).
   *
   * Se llama desde el `onError` del `<img>`. Es la única vía por la que una URL
   * caducada se recupera: `getThumbnailUrls` no vuelve a pedir lo que el store
   * ya tiene, así que su margen de re-firma no cubre a un diagrama ya hidratado.
   *
   * También limpia `thumbPaths`, porque si constaba que este diagrama no tenía
   * miniatura la petición se descartaría antes de llegar a Storage — y el caso
   * de "no la tenía y ahora sí" es exactamente el de un diagrama recién guardado.
   */
  async refreshThumbnailUrl(id: string): Promise<string | null> {
    this.signedThumbs.delete(id)
    this.thumbPaths.delete(id)
    this.thumbCache.delete(id)
    const urls = await this.getThumbnailUrls([id])
    return urls.get(id) ?? null
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

  async saveThumbnail(id: string, dataUrl: string): Promise<string | null> {
    // dataUrl vacío = limpiar thumbnail (diagramStore pasa '' para null).
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      await this.sb.storage.from(THUMB_BUCKET).remove([thumbPath(id)])
      let bumped: string | null = null
      if (this.thumbPaths.get(id) !== null) {
        const { data } = await this.sb
          .from('diagrams').update({ thumbnail_path: null }).eq('id', id)
          .select('updated_at').maybeSingle()
        bumped = (data as { updated_at: string } | null)?.updated_at ?? null
      }
      this.thumbPaths.set(id, null)
      this.thumbCache.set(id, null)
      this.signedThumbs.delete(id)
      return bumped
    }
    const blob = dataUrlToBlob(dataUrl)
    const { error } = await this.sb.storage
      .from(THUMB_BUCKET)
      .upload(thumbPath(id), blob, { upsert: true, contentType: blob.type })
    if (error) throw describeThumbUploadError(error, blob.size)
    // El path es constante por diagrama → tras la primera vez NUNCA tocar la
    // fila. Crítico: ese UPDATE dispara el trigger de updated_at e invalida la
    // versión CAS de TODOS los escritores en cada autosave (era la causa de
    // los conflictos fantasma entre colaboradores). Si sí se toca, devolver el
    // nuevo updated_at para que el llamador adopte la versión.
    let bumped: string | null = null
    if (this.thumbPaths.get(id) !== thumbPath(id)) {
      const { data } = await this.sb
        .from('diagrams').update({ thumbnail_path: thumbPath(id) }).eq('id', id)
        .select('updated_at').maybeSingle()
      bumped = (data as { updated_at: string } | null)?.updated_at ?? null
    }
    this.thumbPaths.set(id, thumbPath(id))
    // Actualizar el cache con el dataURL recién guardado (identidad estable nueva).
    this.thumbCache.set(id, dataUrl)
    // La URL firmada apunta al objeto anterior: soltarla para que la próxima
    // carga de portada firme de nuevo y muestre el thumbnail recién subido.
    this.signedThumbs.delete(id)
    return bumped
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
    // Soft delete del diagrama (sin callers activos; se conserva por la interfaz).
    // Al PURGAR (borrado definitivo) el FK parent_diagram_id ON DELETE CASCADE
    // elimina a los descendientes.
    const { error } = await this.sb.from('diagrams').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
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
