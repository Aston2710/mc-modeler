import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { IImageRepository } from './IImageRepository'
import type { ImageFolder, LibraryImage } from '@/domain/types'
import {
  BUCKET, REF_PREFIX, buildLibraryPath, refToPath,
  dataUrlToBlob, blobToDataUrl, extForMime,
} from '@/utils/imageStorage'

interface ImageRow {
  id: string
  owner_id: string
  project_id: string | null
  folder_id: string | null
  name: string
  storage_path: string
  mime: string
  size_bytes: number
  created_at: string
  updated_at: string
}

function rowToImage(r: ImageRow): LibraryImage {
  return {
    id: r.id,
    name: r.name,
    projectId: r.project_id,
    folderId: r.folder_id,
    mime: r.mime,
    size: r.size_bytes,
    ref: REF_PREFIX + r.storage_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Biblioteca de imágenes sobre Supabase (Postgres + Storage). */
export class SupabaseImageRepository implements IImageRepository {
  private dataCache = new Map<string, string>()

  private get sb(): SupabaseClient {
    if (!supabase) throw new Error('Supabase no configurado')
    return supabase
  }

  private async uid(): Promise<string> {
    const { data, error } = await this.sb.auth.getUser()
    if (error || !data.user) throw new Error('No autenticado')
    return data.user.id
  }

  async getAll(): Promise<LibraryImage[]> {
    const { data, error } = await this.sb
      .from('images')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as ImageRow[]).map(rowToImage)
  }

  async upload({ dataUrl, name, projectId, folderId }: {
    dataUrl: string; name: string; projectId: string | null; folderId: string | null
  }): Promise<LibraryImage> {
    const ownerId = await this.uid()
    const scopeId = projectId ?? ownerId
    const blob = dataUrlToBlob(dataUrl)
    const path = buildLibraryPath(scopeId, crypto.randomUUID(), extForMime(blob.type))
    const { error: upErr } = await this.sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type })
    if (upErr) throw upErr
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const { data, error } = await this.sb.from('images').insert({
      id,
      owner_id: ownerId,
      project_id: projectId,
      folder_id: folderId,
      name,
      storage_path: path,
      mime: blob.type,
      size_bytes: blob.size,
      created_at: now,
      updated_at: now,
    }).select('*').single()
    if (error) throw error
    const image = rowToImage(data as ImageRow)
    this.dataCache.set(image.ref, dataUrl)
    return image
  }

  async rename(id: string, name: string): Promise<void> {
    const { error } = await this.sb.from('images').update({ name }).eq('id', id)
    if (error) throw error
  }

  async move(id: string, folderId: string | null): Promise<void> {
    const { error } = await this.sb.from('images').update({ folder_id: folderId }).eq('id', id)
    if (error) throw error
  }

  async delete(id: string): Promise<void> {
    // .delete().select() devuelve las filas borradas: si RLS bloquea, `data` viene
    // vacío SIN error → lo tratamos como fallo explícito (antes era silencioso).
    const { data, error } = await this.sb.from('images').delete().eq('id', id).select('storage_path')
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('No se pudo eliminar la imagen (sin permiso o ya no existe).')
    }
    const path = (data[0] as { storage_path: string }).storage_path
    if (path) {
      const { error: rmErr } = await this.sb.storage.from(BUCKET).remove([path])
      // El objeto de Storage es best-effort: la fila ya se borró; si el blob queda
      // huérfano no rompe nada (solo ocupa espacio). No hacemos fallar el borrado.
      if (rmErr) console.warn('[images] fila borrada pero el archivo de Storage no:', rmErr)
    }
  }

  async getImageData(image: LibraryImage): Promise<string | null> {
    const cached = this.dataCache.get(image.ref)
    if (cached) return cached
    if (!image.ref.startsWith(REF_PREFIX)) return image.ref.startsWith('data:') ? image.ref : null
    const { data, error } = await this.sb.storage.from(BUCKET).download(refToPath(image.ref))
    if (error || !data) return null
    try {
      const url = await blobToDataUrl(data)
      this.dataCache.set(image.ref, url)
      return url
    } catch {
      return null
    }
  }

  async getFolders(): Promise<ImageFolder[]> {
    const { data, error } = await this.sb
      .from('image_folders')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as { id: string; name: string; project_id: string | null; created_at: string }[]).map((f) => ({
      id: f.id,
      name: f.name,
      projectId: f.project_id,
      createdAt: f.created_at,
    }))
  }

  async saveFolder(folder: ImageFolder): Promise<void> {
    const ownerId = await this.uid()
    const { error } = await this.sb.from('image_folders').upsert(
      { id: folder.id, owner_id: ownerId, project_id: folder.projectId, name: folder.name, created_at: folder.createdAt },
      { onConflict: 'id' }
    )
    if (error) throw error
  }

  async deleteFolder(id: string): Promise<void> {
    const { error } = await this.sb.from('image_folders').delete().eq('id', id)
    if (error) throw error
  }
}
