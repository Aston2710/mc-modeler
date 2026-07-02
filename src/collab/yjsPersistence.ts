import { supabase } from '@/lib/supabase'

/**
 * Carga el estado persistido de un diagrama como una LISTA de updates Yjs (base64),
 * en el orden en que deben aplicarse: primero el snapshot compactado, luego el
 * "tail" de updates del log posteriores al cursor de compactación (last_seq).
 *
 * Los updates de Yjs son conmutativos e idempotentes, así que aplicar
 * snapshot + tail reconstruye exactamente el doc, y una fila corrupta puntual
 * no invalida el resto (el consumidor aplica cada blob con su propio try/catch).
 *
 * Modelo append-only (ver fix_doc/pool-cross-contamination-race-fix.md y el plan
 * de persistencia): los clientes solo AÑADEN updates; el snapshot lo consolida
 * un compactador server-side. Esta función entiende ambos: diagramas que solo
 * tienen snapshot (formato viejo, last_seq=0, tail vacío) y diagramas con log.
 */
export async function loadYjsState(diagramId: string): Promise<string[]> {
  if (!supabase) return []
  const blobs: string[] = []

  // 1. Snapshot compactado + cursor. maybeSingle: null si el diagrama aún no tiene fila.
  const { data: snap } = await supabase
    .from('yjs_documents')
    .select('state, last_seq')
    .eq('diagram_id', diagramId)
    .maybeSingle()
  const snapState = (snap as { state: string | null } | null)?.state ?? null
  if (snapState) blobs.push(snapState)
  const lastSeq = (snap as { last_seq: number | null } | null)?.last_seq ?? 0

  // 2. Tail: updates del log posteriores al snapshot, en orden de secuencia.
  const { data: tail } = await supabase
    .from('yjs_updates')
    .select('update')
    .eq('diagram_id', diagramId)
    .gt('id', lastSeq)
    .order('id', { ascending: true })
  if (tail) for (const row of tail as { update: string }[]) blobs.push(row.update)

  return blobs
}

/**
 * Añade un update Yjs (delta o keyframe de estado completo) al log append-only.
 * Devuelve true si persistió, false si falló (el llamador decide reintentar).
 *
 * Solo INSERT: nunca update/delete sobre una celda compartida. Dos clientes
 * escribiendo a la vez producen dos filas con ids distintos — imposible perder
 * o pisar datos. La consolidación en snapshot la hace el compactador server-side
 * (Fase 4); el cliente jamás vuelve a escribir yjs_documents.state.
 */
export async function appendYjsUpdate(diagramId: string, updateB64: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('yjs_updates')
    .insert({ diagram_id: diagramId, update: updateB64 })
  return !error
}
