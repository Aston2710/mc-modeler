import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { programarMiniaturasFaltantes, reiniciarBackfillParaPruebas, type DependenciasBackfill } from './thumbnailBackfill'

function deps(over: Partial<DependenciasBackfill> = {}) {
  const guardadas = new Map<string, string>()
  const d: DependenciasBackfill = {
    obtenerXml: vi.fn(async (id: string) => `<xml id="${id}"/>`),
    guardar: vi.fn(async (id: string, url: string) => { guardadas.set(id, url) }),
    estaAbierto: vi.fn(() => false),
    renderizar: vi.fn(async (xml: string) => `data:image/webp;base64,${btoa(xml)}`),
    ...over,
  }
  return { d, guardadas }
}

/** Avanza los temporizadores hasta que la cola se vacía. */
async function vaciar() {
  for (let i = 0; i < 100; i++) await vi.advanceTimersByTimeAsync(500)
}

describe('programarMiniaturasFaltantes', () => {
  beforeEach(() => { vi.useFakeTimers(); reiniciarBackfillParaPruebas() })
  afterEach(() => { vi.useRealTimers() })

  it('genera y guarda la miniatura de cada diagrama, de uno en uno', async () => {
    const { d, guardadas } = deps()
    programarMiniaturasFaltantes(['a', 'b'], d)
    expect(d.renderizar).not.toHaveBeenCalled() // espera inicial: no compite con la carga de la portada
    await vaciar()
    expect([...guardadas.keys()]).toEqual(['a', 'b'])
    expect(guardadas.get('a')).toMatch(/^data:image\/webp/)
  })

  it('salta los abiertos en una pestaña y no reintenta los que ya intentó', async () => {
    const { d, guardadas } = deps({ estaAbierto: (id) => id === 'abierto' })
    programarMiniaturasFaltantes(['abierto', 'x'], d)
    await vaciar()
    programarMiniaturasFaltantes(['x'], d) // la portada se recarga
    await vaciar()
    expect([...guardadas.keys()]).toEqual(['x'])
    expect(d.obtenerXml).toHaveBeenCalledTimes(1)
  })

  it('un fallo no detiene la cola ni se reintenta en bucle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { d, guardadas } = deps({
      guardar: vi.fn(async (id: string, url: string) => {
        if (id === 'lector') throw new Error('403')
        guardadas.set(id, url)
      }),
    })
    programarMiniaturasFaltantes(['lector', 'mio'], d)
    await vaciar()
    programarMiniaturasFaltantes(['lector'], d)
    await vaciar()
    expect([...guardadas.keys()]).toEqual(['mio'])
    expect(d.guardar).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('tiene un tope por sesión', async () => {
    const { d, guardadas } = deps()
    programarMiniaturasFaltantes(Array.from({ length: 30 }, (_, i) => `d${i}`), d)
    await vaciar()
    expect(guardadas.size).toBe(20)
  })

  it('un XML vacío no se renderiza', async () => {
    const { d } = deps({ obtenerXml: async () => '' })
    programarMiniaturasFaltantes(['vacio'], d)
    await vaciar()
    expect(d.renderizar).not.toHaveBeenCalled()
    expect(d.guardar).not.toHaveBeenCalled()
  })
})
