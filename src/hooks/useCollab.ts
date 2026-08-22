import { useEffect } from 'react'
import * as Y from 'yjs'
import { useDiagramStore } from '@/store/diagramStore'
import { useAuthStore } from '@/store/authStore'
import { useCollabStore } from '@/store/collabStore'
import { usePresenceStore } from '@/store/presenceStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { CollabChannel } from '@/collab/SupabaseProvider'
import { colorForUser, type CursorState } from '@/collab/presence'
import { uint8ToBase64, base64ToUint8 } from '@/collab/yBpmnModel'
import { YjsBpmnBinding, REMOTE_ORIGIN } from '@/collab/YjsBpmnBinding'
import { isCanvasReadyFor, getReadyDiagramId } from '@/collab/canvasSession'
import { createPendingEdits } from '@/collab/pendingEdits'
import { createBindingLifecycle } from '@/collab/bindingLifecycle'
import { perfStart } from '@/utils/perf'
import { reportIncident } from '@/utils/incidents'
import {
  createBroadcastCoalescer,
  encodeOwnStateVector,
  diffForPeer,
  ANTIENTROPY_INTERVAL_MS,
} from '@/collab/syncProtocol'

const CURSOR_THROTTLE_MS = 50

/**
 * Colaboración en tiempo real para el diagrama activo:
 * presencia + cursores + co-edición CRDT (Yjs) sobre un canal de Supabase.
 *
 * PIVOTE ADR (fuente de verdad única): el Y.Doc es SOLO transporte de sesión.
 * Nace vacío en cada sesión, transporta los cambios en vivo (broadcast) y
 * muere con la sesión — NO se carga ni se persiste estado Yjs. La única
 * persistencia del diagrama es current_xml (autosave + CAS). El handshake
 * onSubscribed/onJoin cubre al late-joiner con el estado de la sesión en curso.
 *
 * No hace nada en modo local (sin Supabase) o sin sesión.
 */
export function useCollab(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelerRef: React.RefObject<any>,
  wrapRef: React.RefObject<HTMLElement | null>,
  // Cache de pestañas (Fase 2): se incrementa cuando la instancia ACTIVA cambia.
  // Al re-adjuntar otra instancia (mismo o distinto diagrama), el binding Yjs
  // debe re-vincularse a ella. Con el flag OFF vale 0 constante → sin efecto.
  activeVersion = 0
) {
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!isSupabaseConfigured || !user || !activeTabId) return
    const wrap = wrapRef.current
    if (!wrap) return

    const diagramId = activeTabId
    const name =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email ||
      'Usuario'
    const me = { userId: user.id, name, color: colorForUser(user.id) }

    const channel = new CollabChannel(diagramId, me)
    const doc = new Y.Doc()
    let binding: YjsBpmnBinding | null = null
    let disposed = false
    let pendingImportHandler: (() => void) | null = null
    let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null
    // Mecanismo A de EXP-011: la maquinaria de "cuándo se da por perdido y qué
    // pasa después" vive en @/collab/bindingLifecycle, donde se puede probar
    // con un reloj inyectado.
    const lifecycle = createBindingLifecycle()
    useCollabStore.getState().setBindingState('esperando')
    // Mide desde que arranca el effect de colaboración hasta que el binding Yjs
    // queda activo (canvas confirmado + binding.start). Es el "tiempo hasta
    // colaboración lista" que se paga en cada cambio de pestaña en modo nube.
    const endBindReady = perfStart('collab:bindReady', { diagramId })

    const clearPendingImportWait = () => {
      if (pendingImportHandler) {
        try { modelerRef.current?.get('eventBus').off('import.done', pendingImportHandler) } catch { /* noop */ }
        pendingImportHandler = null
      }
      if (pendingRetryTimer) { clearTimeout(pendingRetryTimer); pendingRetryTimer = null }
    }

    // Comentarios: ya NO viven en el Y.Doc — ver useComments (tablas Supabase + Realtime).

    const { setParticipants, setCursor, reset } = usePresenceStore.getState()

    // Transporte puro: cada cambio local sale por broadcast. Nada se persiste
    // aquí — la persistencia del diagrama es SOLO current_xml (useAutoSave + CAS).
    // Coalescido: durante un drag salen ~25 updates/s; fusionarlos en ventanas
    // de ~150ms evita el rate limit de Realtime (que dropea en silencio).
    const coalescer = createBroadcastCoalescer((merged) => {
      channel.sendYjsUpdate(uint8ToBase64(merged))
    })

    // Mecanismo B de EXP-011: ver @/collab/pendingEdits. `canEdit` devuelve
    // false tanto para "es viewer" como para "aún no sé quién es", y tratar
    // los dos igual descartaba para siempre las ediciones de los primeros
    // milisegundos, en silencio.
    const pendingEdits = createPendingEdits<Uint8Array>(
      (update) => coalescer.push(update),
      { onOverflow: (max) => reportIncident('collab.edit_buffer_overflow', { max }, { diagramId }) }
    )

    const resolvePendingEdits = () => {
      const canEdit = useCollabStore.getState().canEdit(diagramId)
      const result = pendingEdits.resolve(canEdit)
      if (result.outcome === 'sent') {
        reportIncident('collab.edit_deferred', { count: result.count, dropped: result.dropped }, { diagramId, severity: 'info' })
      } else if (result.outcome === 'discarded') {
        // Viewer confirmado. La propiedad de solo-lectura se conserva intacta:
        // nada de lo que toque un viewer sale de su pestaña.
        reportIncident('collab.edit_dropped_no_role', { count: result.count, dropped: result.dropped }, { diagramId })
      }
    }

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return

      const { canEdit, rolesLoaded } = useCollabStore.getState()

      // Todavía no sabemos quién es este usuario: guardar, no decidir.
      if (!rolesLoaded) {
        pendingEdits.push(update)
        return
      }

      // Solo-lectura (viewer): modo recibir-solo. Aunque la BD (RLS) impide que
      // un viewer persista, un cambio local suyo transmitido por broadcast lo
      // aplicaría el canvas de un editor conectado, cuyo autosave lo guardaría.
      // No transmitir cierra esa fuga: nada de lo que toque un viewer sale de
      // su pestaña. (El binding sigue aplicando cambios REMOTOS para que vea la
      // edición en vivo de los demás.)
      if (!canEdit(diagramId)) return
      coalescer.push(update)
    }

    // Vaciar en cuanto los roles resuelvan, sin esperar a la siguiente edición.
    const unsubscribeRoles = useCollabStore.subscribe((state, prev) => {
      if (state.rolesLoaded && !prev.rolesLoaded) resolvePendingEdits()
    })

    const sendFullState = () => {
      // Viewer (solo-lectura): recibir-solo, no sembrar estado a los peers.
      if (!useCollabStore.getState().canEdit(diagramId)) return
      try {
        channel.sendYjsUpdate(uint8ToBase64(Y.encodeStateAsUpdate(doc)))
      } catch { /* noop */ }
    }

    const startBinding = () => {
      if (disposed || binding) return
      const modeler = modelerRef.current
      if (!modeler) return
      // Defensa en profundidad: startBindingWhenReady ya validó esto antes de
      // llamar, pero nunca arrancamos el binding sin confirmación explícita
      // de que el canvas muestra ESTE diagrama — así una futura regresión que
      // llame startBinding() antes de tiempo falla cerrado, no corrompe datos.
      if (!isCanvasReadyFor(diagramId)) return
      binding = new YjsBpmnBinding(modeler, doc)
      binding.start()
      endBindReady()
    }

    // No inferimos "listo" de heurísticas sobre el contenido del canvas
    // (p. ej. "¿tiene elementos?") — eso es exactamente lo que causaba pools
    // de OTRO diagrama filtrarse: durante un cambio de pestaña el canvas
    // sigue mostrando el diagrama anterior mientras el nuevo importa. En vez
    // de eso, esperamos la confirmación explícita de canvasSession (fencing
    // token, ver useBpmnModeler.importXml) de que este diagramId específico
    // ya terminó de renderizarse.
    const startBindingWhenReady = () => {
      if (disposed) return
      clearPendingImportWait()
      const modeler = modelerRef.current
      if (!modeler) {
        pendingRetryTimer = setTimeout(startBindingWhenReady, 100)
        return
      }
      // La confirmación de identidad del canvas es la única condición de
      // arranque, y no se relaja: relajarla causó EXP-003 (elementos de un
      // diagrama dentro del pool de otro).
      const turn = lifecycle.tick(isCanvasReadyFor(diagramId))
      useCollabStore.getState().setBindingState(turn.state)

      if (turn.event === 'timeout') {
        // Mecanismo A: agotar el plazo pasa a ser un evento, no un final. El
        // contexto es lo que permitirá confirmar o refutar la hipótesis de por
        // qué ocurre (cambio rápido entre pestañas), que hoy está inferida
        // leyendo el código, no observada.
        reportIncident(
          'collab.bind_timeout',
          {
            waited_ms: turn.waitedMs,
            retries: turn.retries,
            ready_diagram: getReadyDiagramId() ?? 'ninguno',
            active_version: activeVersion,
          },
          { diagramId }
        )
      }

      if (turn.state === 'activo') {
        if (turn.event === 'recovered') {
          // Arrancó tras darse por perdido: el caso que antes quedaba muerto
          // el resto de la sesión.
          reportIncident(
            'collab.bind_recovered',
            { waited_ms: turn.waitedMs, retries: turn.retries },
            { diagramId, severity: 'info' }
          )
        }
        startBinding()
        return
      }

      const eventBus = modeler.get('eventBus')
      const onImport = () => {
        // Reevaluar identidad: este import.done puede pertenecer a OTRO
        // diagrama que estaba en curso cuando arrancó este efecto.
        startBindingWhenReady()
      }
      pendingImportHandler = onImport
      eventBus.on('import.done', onImport)
      // Sondeo frecuente mientras hay esperanza, espaciado una vez agotado el
      // plazo: no se deja de mirar, pero tampoco se vigila en balde.
      pendingRetryTimer = setTimeout(startBindingWhenReady, turn.nextDelayMs)
    }

    // El doc nace VACÍO: no se carga estado Yjs persistido. El canvas se pobló
    // desde current_xml (única fuente de verdad); el doc solo acumulará los
    // cambios de ESTA sesión (propios y de peers, vía broadcast).
    doc.on('update', onDocUpdate)
    channel.connect({
      onPresence: setParticipants,
      onCursor: setCursor,
      onYjsUpdate: (incoming: string) => {
        try { Y.applyUpdate(doc, base64ToUint8(incoming), REMOTE_ORIGIN) } catch { /* noop */ }
      },
      // Anti-entropía: un peer publicó su state vector → si nos consta algo
      // que a él le falta (mensaje perdido en su dirección), se lo mandamos
      // como diff exacto. Sin diff → silencio (no hay eco).
      onYjsStateVector: (svB64: string) => {
        try {
          const diff = diffForPeer(doc, base64ToUint8(svB64))
          if (diff) channel.sendYjsUpdate(uint8ToBase64(diff))
        } catch { /* noop */ }
      },
      onSubscribed: sendFullState,
      onJoin: () => sendFullState(),
    })
    startBindingWhenReady()

    // Tick de anti-entropía: publica el state vector propio (bytes — los peers
    // responden solo si nos falta algo) y re-sincroniza canvas↔doc para reparar
    // aplicaciones fallidas o drift del layouter. Broadcast sin garantía de
    // entrega + canvas con side-effects → sin este tick, un mensaje perdido o
    // un recálculo local del router = divergencia permanente entre usuarios.
    const antiEntropyTimer = setInterval(() => {
      if (disposed) return
      try { channel.sendYjsStateVector(uint8ToBase64(encodeOwnStateVector(doc))) } catch { /* noop */ }
      try { binding?.resync() } catch { /* noop */ }
    }, ANTIENTROPY_INTERVAL_MS)

    // ── Cursor local (throttled, en coords de diagrama) ──
    let lastSent = 0
    const onMove = (e: MouseEvent) => {
      const now = Date.now()
      if (now - lastSent < CURSOR_THROTTLE_MS) return
      lastSent = now
      const modeler = modelerRef.current
      if (!modeler) return
      try {
        const vb = modeler.get('canvas').viewbox()
        const rect = wrap.getBoundingClientRect()
        const c: CursorState = {
          x: vb.x + (e.clientX - rect.left) / vb.scale,
          y: vb.y + (e.clientY - rect.top) / vb.scale,
        }
        channel.sendCursor(c)
      } catch { /* noop */ }
    }
    const onLeave = () => channel.sendCursor(null)
    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)

    return () => {
      disposed = true
      clearPendingImportWait()
      clearInterval(antiEntropyTimer)
      unsubscribeRoles()
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
      // Último intento de vaciar lo encolado: si los roles resolvieron entre
      // la última edición y el desmontaje, esos deltas todavía valen.
      resolvePendingEdits()
      // Volcar los últimos deltas coalescidos antes de desconectar (≤150ms de edición).
      coalescer.dispose()
      useCollabStore.getState().setBindingState('esperando')
      doc.off('update', onDocUpdate)
      binding?.destroy()
      void channel.disconnect()
      reset()
      doc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, user?.id, activeVersion])
}
