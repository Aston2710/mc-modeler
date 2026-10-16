/**
 * Revisión final del PR #1 — leer una miniatura no escribe en `diagrams`.
 *
 * `getThumbnail` limpiaba un `thumbnail_path` huérfano con un UPDATE. Ese UPDATE
 * sube `updated_at` y quien lo hizo no adopta la versión nueva: con la opción C
 * (`diagramStore.saveDiagram`), si el diagrama está abierto y el usuario está
 * solo, el siguiente guardado pregunta por un «cambio externo» que nadie hizo.
 * Una lectura no debe tocar la fila; el negativo se recuerda en memoria.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const download = vi.fn()
const update = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: { from: () => ({ download }) },
    from: () => ({ update }),
  },
}))
vi.mock('./LocalRepository', () => ({ LocalRepository: class {} }))

import { SupabaseRepository } from './SupabaseRepository'

let repo: SupabaseRepository

beforeEach(() => {
  download.mockReset()
  update.mockReset()
  update.mockReturnValue({ eq: async () => ({ error: null }) })
  repo = new SupabaseRepository()
})

describe('getThumbnail con un thumbnail_path huérfano', () => {
  it('devuelve null sin escribir en la fila del diagrama', async () => {
    download.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    expect(await repo.getThumbnail('d1')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('recuerda el negativo: la segunda lectura no vuelve a Storage', async () => {
    download.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    await repo.getThumbnail('d1')
    await repo.getThumbnail('d1')
    expect(download).toHaveBeenCalledTimes(1)
  })
})
