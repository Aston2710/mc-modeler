import type { SupabaseClient } from '@supabase/supabase-js'
import { LIMITES_HTTP } from './config'

/**
 * Compuerta de presencia (DEC-013 §4, opción A de la investigación).
 *
 * Antes de modificar un diagrama, el servidor mira si alguien lo tiene abierto
 * en Flujo: se suscribe al MISMO canal `diagram:<id>` que usa el editor, pero
 * SIN `track()` —como `useDiagramsPresence` en la portada—, así no aparece
 * como presente ni dispara el `onJoin` que haría a cada cliente reenviar su
 * estado Yjs completo.
 *
 * Falla CERRADA: si no consigue saberlo en el plazo, se trata como ocupado.
 * Escribir a ciegas sobre una sesión abierta es exactamente la pérdida
 * silenciosa que esta compuerta existe para evitar.
 */

export interface Presente {
  userId: string
  name: string
}

export type EstadoPresencia =
  | { estado: 'libre' }
  | { estado: 'ocupado'; presentes: Presente[] }
  | { estado: 'desconocido' }

export async function comprobarPresencia(
  sb: SupabaseClient,
  diagramId: string,
  timeoutMs: number = LIMITES_HTTP.TIMEOUT_PRESENCIA_MS
): Promise<EstadoPresencia> {
  const canal = sb.channel(`diagram:${diagramId}`, {
    config: { presence: { key: `mcp-observador:${diagramId}:${crypto.randomUUID()}` }, broadcast: { self: false } },
  })
  try {
    return await new Promise<EstadoPresencia>((resolver) => {
      const plazo = setTimeout(() => resolver({ estado: 'desconocido' }), timeoutMs)
      canal.on('presence', { event: 'sync' }, () => {
        clearTimeout(plazo)
        const estado = canal.presenceState<{ userId?: string; name?: string }>()
        const presentes = Object.values(estado)
          .map((entradas) => entradas[0])
          .filter((e) => e && typeof e.userId === 'string')
          .map((e) => ({ userId: e.userId as string, name: String(e.name ?? 'alguien') }))
        resolver(presentes.length ? { estado: 'ocupado', presentes } : { estado: 'libre' })
      })
      canal.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(plazo)
          resolver({ estado: 'desconocido' })
        }
      })
    })
  } finally {
    await sb.removeChannel(canal).catch(() => undefined)
  }
}
