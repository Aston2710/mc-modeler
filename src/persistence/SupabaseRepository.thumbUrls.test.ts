/**
 * PLAN-012 paso 3 — las miniaturas se piden en una sola llamada.
 *
 * Antes la portada resolvía cada miniatura por separado: una descarga
 * autenticada más una conversión a base64 por tarjeta. Con la portada llena
 * eran ~78 peticiones secuenciales y ~4 MB por el hilo principal.
 *
 * Además de contar llamadas, aquí se fija la propiedad de seguridad: el bucket
 * sigue privado y las URLs caducan pronto, para que una que se filtre quede
 * inservible enseguida.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const createSignedUrls = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: { from: () => ({ createSignedUrls }) },
    from: () => ({ update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
  },
}))
vi.mock('./LocalRepository', () => ({ LocalRepository: class {} }))

import { SupabaseRepository } from './SupabaseRepository'

const ok = (paths: string[]) =>
  paths.map((p) => ({ path: p, signedUrl: `https://cdn.test/${p}?token=abc`, error: null }))

let repo: SupabaseRepository

beforeEach(() => {
  createSignedUrls.mockReset()
  repo = new SupabaseRepository()
})

describe('getThumbnailUrls', () => {
  it('resuelve N miniaturas con UNA sola llamada', async () => {
    const ids = Array.from({ length: 78 }, (_, i) => `d${i}`)
    createSignedUrls.mockResolvedValue({ data: ok(ids.map((id) => `${id}/thumb`)), error: null })

    const urls = await repo.getThumbnailUrls(ids)

    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(urls.size).toBe(78)
    expect(urls.get('d0')).toContain('d0/thumb')
  })

  it('firma con caducidad acotada — una URL filtrada no sirve para siempre', async () => {
    createSignedUrls.mockResolvedValue({ data: ok(['a/thumb']), error: null })

    await repo.getThumbnailUrls(['a'])

    // 90 minutos, fijado por el usuario el 2026-08-22. Es un compromiso: la
    // caché HTTP se indexa por URL, así que un TTL corto obliga a re-descargar
    // la portada entera y tira la ganancia de PLAN-012 — en una cuenta gratuita
    // la cacheabilidad vale más que los bytes. El techo de la aserción existe
    // para que nadie lo convierta en "prácticamente permanente" sin decidirlo.
    const [, ttl] = createSignedUrls.mock.calls[0]
    expect(ttl).toBe(90 * 60)
    expect(ttl).toBeLessThanOrEqual(24 * 3600)
  })

  it('no vuelve a firmar lo que ya tiene vigente', async () => {
    createSignedUrls.mockResolvedValue({ data: ok(['a/thumb', 'b/thumb']), error: null })
    await repo.getThumbnailUrls(['a', 'b'])

    await repo.getThumbnailUrls(['a', 'b'])

    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('solo pide lo que falta', async () => {
    createSignedUrls.mockResolvedValueOnce({ data: ok(['a/thumb']), error: null })
    await repo.getThumbnailUrls(['a'])

    createSignedUrls.mockResolvedValueOnce({ data: ok(['b/thumb']), error: null })
    const urls = await repo.getThumbnailUrls(['a', 'b'])

    expect(createSignedUrls).toHaveBeenCalledTimes(2)
    expect(createSignedUrls.mock.calls[1][0]).toEqual(['b/thumb'])
    expect(urls.size).toBe(2) // 'a' sale del cache, 'b' recién firmada
  })

  it('empareja por ruta, no por orden de la respuesta', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'b/thumb', signedUrl: 'https://cdn.test/B', error: null },
        { path: 'a/thumb', signedUrl: 'https://cdn.test/A', error: null },
      ],
      error: null,
    })

    const urls = await repo.getThumbnailUrls(['a', 'b'])

    expect(urls.get('a')).toBe('https://cdn.test/A')
    expect(urls.get('b')).toBe('https://cdn.test/B')
  })

  it('omite las que Storage no pudo firmar, sin romper el resto', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'a/thumb', signedUrl: 'https://cdn.test/A', error: null },
        { path: 'b/thumb', signedUrl: null, error: 'Object not found' },
      ],
      error: null,
    })

    const urls = await repo.getThumbnailUrls(['a', 'b'])

    expect(urls.get('a')).toBe('https://cdn.test/A')
    expect(urls.has('b')).toBe(false)
  })

  it('recuerda las que no existen y no las vuelve a pedir', async () => {
    createSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'x/thumb', signedUrl: null, error: 'Object not found' }],
      error: null,
    })
    await repo.getThumbnailUrls(['x'])

    await repo.getThumbnailUrls(['x'])

    // La segunda vuelta no llega a llamar: ya consta que no hay miniatura.
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('un fallo de Storage deja la portada sin imágenes, no rota', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: new Error('red caída') })

    const urls = await repo.getThumbnailUrls(['a', 'b'])

    expect(urls.size).toBe(0)
  })

  it('con la lista vacía no llama a Storage', async () => {
    const urls = await repo.getThumbnailUrls([])
    expect(createSignedUrls).not.toHaveBeenCalled()
    expect(urls.size).toBe(0)
  })
})

/**
 * La red de seguridad del `onError`. Sin esto, una URL caducada deja la tarjeta
 * con la imagen rota para siempre: el store solo pide las URLs una vez por
 * sesión, así que el margen de re-firma de `getThumbnailUrls` nunca se aplica a
 * un diagrama ya hidratado.
 */
describe('refreshThumbnailUrl', () => {
  it('vuelve a firmar aunque la anterior siguiera vigente en caché', async () => {
    createSignedUrls.mockResolvedValue({ data: ok(['a/thumb']), error: null })
    await repo.getThumbnailUrls(['a'])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)

    // getThumbnailUrls no volvería a llamar: la entrada está vigente.
    await repo.getThumbnailUrls(['a'])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)

    // refreshThumbnailUrl sí, que es justo su razón de ser.
    const url = await repo.refreshThumbnailUrl('a')
    expect(createSignedUrls).toHaveBeenCalledTimes(2)
    expect(url).toContain('a/thumb')
  })

  it('reintenta incluso si constaba que el diagrama no tenía miniatura', async () => {
    // Primero Storage dice que no existe: queda anotado para no reintentar.
    createSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'x/thumb', signedUrl: null, error: 'Object not found' }],
      error: null,
    })
    await repo.getThumbnailUrls(['x'])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)

    // Ahora sí existe — el caso de un diagrama recién guardado. La anotación no
    // debe impedir la recuperación.
    createSignedUrls.mockResolvedValueOnce({ data: ok(['x/thumb']), error: null })
    const url = await repo.refreshThumbnailUrl('x')

    expect(createSignedUrls).toHaveBeenCalledTimes(2)
    expect(url).toContain('x/thumb')
  })

  it('devuelve null sin lanzar si sigue sin poder resolverse', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: new Error('red caída') })
    expect(await repo.refreshThumbnailUrl('a')).toBe(null)
  })
})
