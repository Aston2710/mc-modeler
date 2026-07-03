import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock de Supabase Storage ────────────────────────────────────
const { storageState } = vi.hoisted(() => ({
  storageState: {
    uploads: [] as { path: string; type: string }[],
    copies: [] as { from: string; to: string }[],
    failUploads: false,
    failCopies: false,
    downloadBlob: null as Blob | null,
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string, blob: Blob) => {
          if (storageState.failUploads) return Promise.resolve({ error: { message: 'boom' } })
          storageState.uploads.push({ path, type: blob.type })
          return Promise.resolve({ error: null })
        },
        copy: (from: string, to: string) => {
          if (storageState.failCopies) return Promise.resolve({ error: { message: 'boom' } })
          storageState.copies.push({ from, to })
          return Promise.resolve({ error: null })
        },
        download: () => Promise.resolve({ data: storageState.downloadBlob, error: storageState.downloadBlob ? null : { message: '404' } }),
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  },
  isSupabaseConfigured: true,
}))

import { uploadImageDataUrl, externalizeImages, rehomeImages, isStorageImageRef } from './imageStorage'

const WEBP_DATAURL = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
const xmlWith = (url: string) =>
  `<bpmn:definitions><bpmn:textAnnotation id="TA_1"><bpmn:text>[IMAGE:${url}]</bpmn:text></bpmn:textAnnotation></bpmn:definitions>`

beforeEach(() => {
  storageState.uploads = []
  storageState.copies = []
  storageState.failUploads = false
  storageState.failCopies = false
  storageState.downloadBlob = null
})

describe('imageStorage', () => {
  it('uploadImageDataUrl: sube a <diagramId>/<uuid>.webp y devuelve ref storage://', async () => {
    const ref = await uploadImageDataUrl('diag-1', WEBP_DATAURL)
    expect(isStorageImageRef(ref)).toBe(true)
    expect(ref).toMatch(/^storage:\/\/diagram-images\/diag-1\/[0-9a-f-]+\.webp$/)
    expect(storageState.uploads).toHaveLength(1)
    expect(storageState.uploads[0].type).toBe('image/webp')
  })

  it('uploadImageDataUrl: si la subida falla, devuelve el dataURL (queda embebida, no bloquea)', async () => {
    storageState.failUploads = true
    const out = await uploadImageDataUrl('diag-1', WEBP_DATAURL)
    expect(out).toBe(WEBP_DATAURL)
  })

  it('externalizeImages: reemplaza [IMAGE:data:...] por referencias de Storage', async () => {
    const out = await externalizeImages(xmlWith(WEBP_DATAURL), 'diag-2')
    expect(out).not.toContain('data:image/webp')
    expect(out).toMatch(/\[IMAGE:storage:\/\/diagram-images\/diag-2\/[0-9a-f-]+\.webp\]/)
  })

  it('externalizeImages: no toca URLs externas ni refs ya externalizadas', async () => {
    const xml = xmlWith('https://drive.google.com/uc?id=abc') + xmlWith('storage://diagram-images/d/x.webp')
    const out = await externalizeImages(xml, 'diag-3')
    expect(out).toBe(xml)
    expect(storageState.uploads).toHaveLength(0)
  })

  it('rehomeImages: copia el objeto a la carpeta del nuevo diagrama y reescribe la ref', async () => {
    const xml = xmlWith('storage://diagram-images/old-diag/aaa.webp')
    const out = await rehomeImages(xml, 'new-diag')
    expect(storageState.copies).toHaveLength(1)
    expect(storageState.copies[0].from).toBe('old-diag/aaa.webp')
    expect(storageState.copies[0].to).toMatch(/^new-diag\/[0-9a-f-]+\.webp$/)
    expect(out).toContain('storage://diagram-images/new-diag/')
    expect(out).not.toContain('old-diag')
  })

  it('rehomeImages: si la copia falla, conserva la referencia original (imagen compartida > rota)', async () => {
    storageState.failCopies = true
    const xml = xmlWith('storage://diagram-images/old-diag/aaa.webp')
    const out = await rehomeImages(xml, 'new-diag')
    expect(out).toBe(xml)
  })
})
