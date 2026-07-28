import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ParticipantMeta } from '@/collab/presence'

/**
 * Presencia en vivo de VARIOS diagramas a la vez, para mostrar en la Home quién
 * está editando cada uno (como los avatares del editor).
 *
 * Reusa el MISMO canal de presencia del editor (`diagram:{id}`) pero en modo
 * SOLO-LECTURA: se suscribe y lee `presenceState`, pero NO llama a `.track()`,
 * así el usuario que navega la Home no aparece como "presente/editando".
 *
 * Coste acotado: un canal ligero por diagrama del conjunto que se le pase. El
 * llamador debe acotar el conjunto (p. ej. solo los diagramas de un proyecto
 * abierto), NO pasarle los 79 de "Todos". Se re-suscribe solo si cambia el set
 * de ids (clave ordenada), no en cada render ni al buscar/ordenar.
 *
 * @returns mapa diagramId → participantes presentes.
 */
export function useDiagramsPresence(diagramIds: string[]): Record<string, ParticipantMeta[]> {
  const key = [...diagramIds].sort().join(',')
  const [presence, setPresence] = useState<Record<string, ParticipantMeta[]>>({})

  useEffect(() => {
    if (!supabase || !key) { setPresence({}); return }
    const client = supabase
    const ids = key.split(',').filter(Boolean)

    const channels = ids.map((id) => {
      const ch = client.channel(`diagram:${id}`, {
        // key propia de observador; no se hace track, así no registra presencia.
        config: { presence: { key: `home-observer:${id}` }, broadcast: { self: false } },
      })
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<ParticipantMeta>()
        const parts = Object.values(state)
          .map((entries) => entries[0])
          .filter(Boolean)
          .map((e) => ({ userId: e.userId, name: e.name, color: e.color }))
        setPresence((prev) => ({ ...prev, [id]: parts }))
      })
      ch.subscribe()
      return ch
    })

    return () => { channels.forEach((ch) => { void client.removeChannel(ch) }) }
  }, [key])

  return presence
}
