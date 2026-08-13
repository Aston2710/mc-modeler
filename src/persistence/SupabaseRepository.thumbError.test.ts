import { describe, it, expect } from 'vitest'
import { describeThumbUploadError } from './SupabaseRepository'

/**
 * El mensaje literal que devuelve Supabase Storage al superar el techo del
 * bucket. Verificado contra el stack local el 2026-08-13:
 *
 *   POST /storage/v1/object/thumbnails/<id>/thumb  (6 MB)
 *   → 400 {"statusCode":"413","error":"Payload too large",
 *          "message":"The object exceeded the maximum allowed size",
 *          "code":"EntityTooLarge"}
 *
 * Si Storage cambia este texto, este test falla y avisa antes de que el
 * diagnostico deje de funcionar en produccion.
 */
const STORAGE_TOO_LARGE = 'The object exceeded the maximum allowed size'

describe('describeThumbUploadError', () => {
  it('reconoce el mensaje real de Storage al superar el techo', () => {
    const err = describeThumbUploadError(new Error(STORAGE_TOO_LARGE), 6 * 1024 * 1024)
    expect(err.message).toContain('supera el techo del bucket')
    expect(err.message).toContain('6144 kB')
  })

  it('reconoce el fallo por tamano aunque el mensaje no lo diga, si el blob excede el techo', () => {
    // Storage podria responder con un error generico; el tamano local basta.
    const err = describeThumbUploadError(new Error('network error'), 8 * 1024 * 1024)
    expect(err.message).toContain('supera el techo del bucket')
  })

  it('no culpa al tamano cuando el fallo es de otra cosa', () => {
    const err = describeThumbUploadError(new Error('new row violates row-level security policy'), 120 * 1024)
    expect(err.message).not.toContain('supera el techo')
    expect(err.message).toContain('120 kB')
    expect(err.message).toContain('row-level security')
  })

  it('conserva el error original y el tamano para depurar', () => {
    const original = new Error(STORAGE_TOO_LARGE)
    const err = describeThumbUploadError(original, 6 * 1024 * 1024)
    expect(err.originalError).toBe(original)
    expect(err.sizeBytes).toBe(6 * 1024 * 1024)
    expect(err.tooBig).toBe(true)
  })

  it('tolera un error que no es Error', () => {
    const err = describeThumbUploadError({ statusCode: '413' }, 400 * 1024)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('400 kB')
    expect(err.tooBig).toBe(false)
  })
})
