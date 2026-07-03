import { supabase } from '@/lib/supabase'

/**
 * Imágenes de diagramas en Supabase Storage (ADR persistence-source, Etapa 4).
 *
 * Antes las imágenes vivían como `[IMAGE:data:...base64...]` dentro del XML →
 * filas de MBs en `diagrams.current_xml` (bloat). Ahora se suben al bucket
 * privado `diagram-images` (RLS por diagrama, carpeta = diagram_id) y el XML
 * guarda una referencia ligera:
 *
 *     [IMAGE:storage://diagram-images/<diagramId>/<uuid>.webp]
 *
 * El renderer resuelve la referencia bajo demanda (download autenticado →
 * objectURL, con caché). Para exportar archivos autocontenidos (.bpmn/.bpm),
 * `inlineImages` vuelve a incrustar las referencias como base64.
 *
 * Modo local (sin Supabase): todo es no-op y la imagen queda embebida (dataURL),
 * como siempre.
 */

const BUCKET = 'diagram-images'
const REF_PREFIX = `storage://${BUCKET}/`
/** Token de imagen dentro del texto de una TextAnnotation. */
const IMG_TOKEN_RE = /\[IMAGE:([^\]]+)\]/g

export function isStorageImageRef(url: string): boolean {
  return url.startsWith(REF_PREFIX)
}

const refToPath = (ref: string) => ref.slice(REF_PREFIX.length)

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, commaIdx)
  const payload = dataUrl.slice(commaIdx + 1)
  const mime = /:(.*?)[;,]/.exec(header)?.[1] ?? 'image/png'
  if (header.includes(';base64')) {
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(payload)], { type: mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const extForMime = (mime: string): string =>
  mime === 'image/webp' ? 'webp'
  : mime === 'image/png' ? 'png'
  : mime === 'image/jpeg' ? 'jpg'
  : mime === 'image/gif' ? 'gif'
  : mime === 'image/svg+xml' ? 'svg'
  : 'img'

/**
 * Sube un dataURL al Storage y devuelve la referencia `storage://...`.
 * Fallback seguro: si no hay Supabase o la subida falla, devuelve el dataURL
 * original (la imagen queda embebida — funcional, solo pesa; se puede
 * externalizar después con el script de migración).
 */
export async function uploadImageDataUrl(diagramId: string, dataUrl: string): Promise<string> {
  if (!supabase || !diagramId) return dataUrl
  try {
    const blob = dataUrlToBlob(dataUrl)
    const path = `${diagramId}/${crypto.randomUUID()}.${extForMime(blob.type)}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type })
    if (error) throw error
    return REF_PREFIX + path
  } catch (e) {
    console.warn('[images] subida a Storage falló; la imagen queda embebida:', e)
    return dataUrl
  }
}

// ── Resolución para render (ref → dataURL, con caché) ──────────
// dataURL (no objectURL): el SVG del canvas se serializa para exportar a
// PNG/SVG/PDF, y un blob: URL no sobrevive esa serialización — un data: sí.

const resolvedCache = new Map<string, string>()
const pendingResolves = new Map<string, Promise<string | null>>()

/** Lectura síncrona del caché (para el renderer, que es síncrono). */
export function getResolvedImage(ref: string): string | null {
  return resolvedCache.get(ref) ?? null
}

/** Descarga (autenticada, RLS) y cachea la imagen como dataURL. */
export function resolveImageRef(ref: string): Promise<string | null> {
  const cached = resolvedCache.get(ref)
  if (cached) return Promise.resolve(cached)
  if (!supabase) return Promise.resolve(null)
  const pending = pendingResolves.get(ref)
  if (pending) return pending
  const p = supabase.storage
    .from(BUCKET)
    .download(refToPath(ref))
    .then(async ({ data, error }) => {
      pendingResolves.delete(ref)
      if (error || !data) return null
      const dataUrl = await blobToDataUrl(data)
      resolvedCache.set(ref, dataUrl)
      return dataUrl
    })
    .catch(() => {
      pendingResolves.delete(ref)
      return null
    })
  pendingResolves.set(ref, p)
  return p
}

// ── Transformaciones de XML ─────────────────────────────────────

/** Aplica un reemplazo async a cada token [IMAGE:...] cuyo url pase el filtro. */
async function mapImageTokens(
  xml: string,
  filter: (url: string) => boolean,
  transform: (url: string) => Promise<string>
): Promise<string> {
  const targets = new Map<string, string>() // url original → url nuevo
  for (const m of xml.matchAll(IMG_TOKEN_RE)) {
    const url = m[1]
    if (filter(url) && !targets.has(url)) targets.set(url, url)
  }
  for (const url of targets.keys()) {
    targets.set(url, await transform(url))
  }
  if (targets.size === 0) return xml
  return xml.replace(IMG_TOKEN_RE, (whole, url: string) => {
    const next = targets.get(url)
    return next && next !== url ? `[IMAGE:${next}]` : whole
  })
}

/**
 * Reemplaza imágenes embebidas (`data:`) por referencias de Storage.
 * Uso: al importar un archivo (y en el script de migración retroactiva).
 */
export function externalizeImages(xml: string, diagramId: string): Promise<string> {
  if (!supabase) return Promise.resolve(xml)
  return mapImageTokens(
    xml,
    (url) => url.startsWith('data:'),
    (url) => uploadImageDataUrl(diagramId, url)
  )
}

/**
 * Reemplaza referencias de Storage por base64 (dataURL) — para exportar
 * archivos autocontenidos (.bpmn / .bpm) que funcionen fuera de la app.
 * Si una imagen no se puede descargar, la referencia queda como está.
 */
export function inlineImages(xml: string): Promise<string> {
  if (!supabase) return Promise.resolve(xml)
  return mapImageTokens(xml, isStorageImageRef, async (ref) => (await resolveImageRef(ref)) ?? ref)
}

/**
 * Copia las imágenes referenciadas a la carpeta de OTRO diagrama y reescribe
 * las referencias. Uso: duplicar diagrama — sin esto, la copia apuntaría a los
 * objetos del original (se romperían al borrar el original o para
 * colaboradores sin acceso a él). Si una copia falla, se conserva la
 * referencia original (mejor imagen compartida que imagen rota).
 */
export function rehomeImages(xml: string, newDiagramId: string): Promise<string> {
  if (!supabase) return Promise.resolve(xml)
  return mapImageTokens(xml, isStorageImageRef, async (ref) => {
    try {
      const fromPath = refToPath(ref)
      const ext = fromPath.split('.').pop() ?? 'img'
      const toPath = `${newDiagramId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase!.storage.from(BUCKET).copy(fromPath, toPath)
      if (error) return ref
      return REF_PREFIX + toPath
    } catch {
      return ref
    }
  })
}

/** Borra la carpeta de imágenes de un diagrama (al borrar el diagrama). Best-effort. */
export async function deleteDiagramImages(diagramId: string): Promise<void> {
  if (!supabase) return
  try {
    const { data } = await supabase.storage.from(BUCKET).list(diagramId)
    if (!data?.length) return
    await supabase.storage.from(BUCKET).remove(data.map((o) => `${diagramId}/${o.name}`))
  } catch { /* best-effort */ }
}
