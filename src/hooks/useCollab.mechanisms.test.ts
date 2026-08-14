/**
 * PLAN-014 paso 4 — reproducir los mecanismos de EXP-011, no solo razonarlos.
 *
 * Cubre los dos que este plan mitiga:
 *   B — una edición emitida antes de que `loadRoles()` resolviera se
 *       descartaba para siempre. Ahora se difiere y se decide al saber el rol.
 *   A — agotar la espera de confirmación del canvas dejaba la colaboración
 *       muerta el resto de la sesión. Ahora se anota y se sigue reintentando.
 *
 * Se ejercitan los MISMOS módulos que usa `useCollab.ts` (`pendingEdits`,
 * `bindingLifecycle`, `collabStore`), no una réplica de su lógica: una prueba
 * que reimplementa lo que verifica deja de detectar el fallo en cuanto el
 * código cambia.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('@/lib/sharing', () => ({
  getMyRoles: async () => ({}),
  getMyProjectRoles: async () => ({}),
}))

import { useCollabStore } from '@/store/collabStore'
import { useDiagramStore } from '@/store/diagramStore'
import { createPendingEdits, PENDING_EDITS_MAX } from '@/collab/pendingEdits'
import {
  createBindingLifecycle,
  BIND_CONFIRM_TIMEOUT_MS,
  BIND_POLL_MS,
  BIND_RETRY_INTERVAL_MS,
} from '@/collab/bindingLifecycle'
import { reportIncident, getIncidents, clearIncidents, type IncidentCode } from '@/utils/incidents'

const DID = 'diagram-1'

beforeEach(() => {
  clearIncidents()
  useCollabStore.setState({
    rolesByDiagram: {},
    rolesByProject: {},
    rolesLoaded: false,
    bindingState: 'esperando',
  })
  useDiagramStore.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    diagrams: [{ id: DID, projectId: null }] as any,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const codes = (): IncidentCode[] => getIncidents().map((i) => i.code)

// ────────────────────────────────────────────────────────────────────────────

describe('Mecanismo B — encolar en vez de descartar', () => {
  it('una edición emitida antes de conocer el rol no se pierde', () => {
    const sent: number[] = []
    const buf = createPendingEdits<number>((u) => sent.push(u))

    buf.push(1)

    expect(sent).toEqual([]) // aún no se envía: no sabemos el rol
    expect(buf.size()).toBe(1) // pero tampoco se tira, que era el fallo
  })

  it('al resolver como editor se envía todo, en orden', () => {
    const sent: number[] = []
    const buf = createPendingEdits<number>((u) => sent.push(u))
    buf.push(1)
    buf.push(2)
    buf.push(3)

    useCollabStore.setState({ rolesByDiagram: { [DID]: 'editor' }, rolesLoaded: true })
    const result = buf.resolve(useCollabStore.getState().canEdit(DID))

    expect(sent).toEqual([1, 2, 3])
    expect(result).toEqual({ outcome: 'sent', count: 3, dropped: 0 })
    expect(buf.size()).toBe(0)
  })

  it('al resolver como viewer se descarta: la fuga de solo-lectura sigue cerrada', () => {
    const sent: number[] = []
    const buf = createPendingEdits<number>((u) => sent.push(u))
    buf.push(1)
    buf.push(2)

    useCollabStore.setState({ rolesByDiagram: { [DID]: 'viewer' }, rolesLoaded: true })
    const result = buf.resolve(useCollabStore.getState().canEdit(DID))

    expect(sent).toEqual([]) // nada de un viewer sale de su pestaña
    expect(result.outcome).toBe('discarded')
  })

  it('un owner también vacía el buffer', () => {
    const sent: number[] = []
    const buf = createPendingEdits<number>((u) => sent.push(u))
    buf.push(7)

    useCollabStore.setState({ rolesByDiagram: { [DID]: 'owner' }, rolesLoaded: true })
    buf.resolve(useCollabStore.getState().canEdit(DID))

    expect(sent).toEqual([7])
  })

  it('el rol heredado del proyecto también cuenta', () => {
    const sent: number[] = []
    const buf = createPendingEdits<number>((u) => sent.push(u))
    buf.push(1)

    useDiagramStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      diagrams: [{ id: DID, projectId: 'proj-1' }] as any,
    })
    useCollabStore.setState({ rolesByProject: { 'proj-1': 'editor' }, rolesLoaded: true })
    buf.resolve(useCollabStore.getState().canEdit(DID))

    expect(sent).toEqual([1])
  })

  it('el buffer está acotado: descarta lo más viejo y avisa una sola vez', () => {
    const overflows: number[] = []
    const buf = createPendingEdits<number>(() => {}, { onOverflow: (max) => overflows.push(max) })

    for (let i = 0; i < PENDING_EDITS_MAX + 5; i++) buf.push(i)

    expect(buf.size()).toBe(PENDING_EDITS_MAX)
    expect(buf.peek()[0]).toBe(5) // se fueron las 5 más viejas
    expect(buf.droppedCount()).toBe(5)
    expect(overflows).toEqual([PENDING_EDITS_MAX]) // un aviso, no cinco
  })

  it('resolver un buffer vacío no genera evento', () => {
    const buf = createPendingEdits<number>(() => {})
    expect(buf.resolve(true)).toEqual({ outcome: 'empty', count: 0, dropped: 0 })
  })

  it('el contador de descartes se reinicia tras resolver', () => {
    const buf = createPendingEdits<number>(() => {}, { max: 2 })
    buf.push(1)
    buf.push(2)
    buf.push(3)
    expect(buf.droppedCount()).toBe(1)

    buf.resolve(true)
    expect(buf.droppedCount()).toBe(0)
  })

  it('sin Supabase (modo local) no hay ventana de incertidumbre', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }))
    const { useCollabStore: localStore } = await import('@/store/collabStore')

    expect(localStore.getState().rolesLoaded).toBe(true)
    expect(localStore.getState().canEdit(DID)).toBe(true)
  })

  it('un fallo de loadRoles NO marca los roles como cargados', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: null }))
    vi.doMock('@/lib/sharing', () => ({
      getMyRoles: async () => { throw new Error('sin sesión') },
      getMyProjectRoles: async () => ({}),
    }))
    const { useCollabStore: store } = await import('@/store/collabStore')

    await store.getState().loadRoles()

    // Seguimos sin saber: quien pregunte debe tratarlo como incertidumbre,
    // no como una negativa, o volvemos a descartar trabajo del usuario.
    expect(store.getState().rolesLoaded).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────

describe('Mecanismo A — agotar el plazo es un evento, no un final', () => {
  /** Reloj inyectado: nada de esperas reales en la suite. */
  function clockedLifecycle() {
    let now = 0
    const lifecycle = createBindingLifecycle(() => now)
    return { lifecycle, advance: (ms: number) => { now += ms } }
  }

  it('el caso normal arranca sin generar ruido', () => {
    const { lifecycle, advance } = clockedLifecycle()
    advance(400)

    const turn = lifecycle.tick(true)

    expect(turn.state).toBe('activo')
    expect(turn.event).toBe('started')
    expect(codes()).toEqual([])
  })

  it('mientras hay esperanza sondea rápido', () => {
    const { lifecycle, advance } = clockedLifecycle()
    advance(500)

    const turn = lifecycle.tick(false)

    expect(turn.state).toBe('esperando')
    expect(turn.nextDelayMs).toBe(BIND_POLL_MS)
  })

  it('pasado el plazo marca agotado y espacia el sondeo', () => {
    const { lifecycle, advance } = clockedLifecycle()
    advance(BIND_CONFIRM_TIMEOUT_MS + 1)

    const turn = lifecycle.tick(false)

    expect(turn.state).toBe('agotado')
    expect(turn.event).toBe('timeout')
    expect(turn.nextDelayMs).toBe(BIND_RETRY_INTERVAL_MS)
    expect(turn.waitedMs).toBeGreaterThan(BIND_CONFIRM_TIMEOUT_MS)
  })

  it('emite el evento de agotamiento UNA vez aunque se siga sondeando', () => {
    const { lifecycle, advance } = clockedLifecycle()
    advance(BIND_CONFIRM_TIMEOUT_MS + 1)

    const events = [
      lifecycle.tick(false).event,
      (advance(2000), lifecycle.tick(false).event),
      (advance(2000), lifecycle.tick(false).event),
    ]

    expect(events.filter((e) => e === 'timeout')).toHaveLength(1)
  })

  it('SIGUE reintentando tras agotarse: un canvas que confirma tarde arranca igual', () => {
    // Antes esto era imposible: se hacía `return` y no se volvía a mirar nunca
    // en toda la sesión, con presencia y cursores siguiendo vivos.
    const { lifecycle, advance } = clockedLifecycle()
    advance(BIND_CONFIRM_TIMEOUT_MS + 1)
    expect(lifecycle.tick(false).state).toBe('agotado')

    advance(4000)
    const turn = lifecycle.tick(true)

    expect(turn.state).toBe('activo')
    expect(turn.event).toBe('recovered')
  })

  it('una vez activo se queda activo y deja de sondear', () => {
    const { lifecycle, advance } = clockedLifecycle()
    advance(100)
    lifecycle.tick(true)

    advance(5000)
    const turn = lifecycle.tick(false)

    expect(turn.state).toBe('activo')
    expect(turn.event).toBe(null)
    expect(turn.nextDelayMs).toBe(0)
  })

  it('cuenta los reintentos, que es lo que permitirá diagnosticar', () => {
    const { lifecycle, advance } = clockedLifecycle()
    for (let i = 0; i < 4; i++) { advance(300); lifecycle.tick(false) }
    expect(lifecycle.retries()).toBe(4)
  })

  it('el estado del binding es observable desde fuera del hook', () => {
    const { lifecycle, advance } = clockedLifecycle()

    advance(BIND_CONFIRM_TIMEOUT_MS + 1)
    useCollabStore.getState().setBindingState(lifecycle.tick(false).state)
    expect(useCollabStore.getState().bindingState).toBe('agotado')

    advance(1000)
    useCollabStore.getState().setBindingState(lifecycle.tick(true).state)
    expect(useCollabStore.getState().bindingState).toBe('activo')
  })
})

// ────────────────────────────────────────────────────────────────────────────

describe('registro de incidentes', () => {
  it('captura el contexto necesario para diagnosticar el agotamiento', () => {
    reportIncident(
      'collab.bind_timeout',
      { waited_ms: 10032, retries: 3, ready_diagram: 'ninguno', active_version: 2 },
      { diagramId: DID }
    )

    const incident = getIncidents().find((i) => i.code === 'collab.bind_timeout')
    expect(incident?.diagramId).toBe(DID)
    expect(incident?.detail?.waited_ms).toBe(10032)
    expect(incident?.severity).toBe('warn')
  })

  it('nunca lanza', () => {
    expect(() => reportIncident('save.invalid_xml', { a: 1, b: 'x', c: true })).not.toThrow()
  })

  it('solo registra escalares: la regla de contenido se cumple', () => {
    // El detalle debe poder enseñarse a alguien sin derecho a ver ningún
    // proceso de la empresa: ids, códigos y números, nunca XML ni etiquetas.
    reportIncident('collab.bind_timeout', { waited_ms: 10032, retries: 3 }, { diagramId: DID })

    const all = getIncidents()
    for (const v of Object.values(all[all.length - 1]?.detail ?? {})) {
      expect(['string', 'number', 'boolean']).toContain(typeof v)
    }
  })

  it('el buffer no crece sin control', () => {
    for (let i = 0; i < 260; i++) reportIncident('save.invalid_xml', { i })
    expect(getIncidents().length).toBeLessThanOrEqual(200)
  })
})
