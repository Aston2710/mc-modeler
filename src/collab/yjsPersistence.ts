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

/** Persiste (upsert) el snapshot del Y.Doc (base64). */
export async function saveYjsState(diagramId: string, stateB64: string): Promise<void> {
  if (!supabase) return
  await supabase
    .from('yjs_documents')
    .upsert(
      { diagram_id: diagramId, state: stateB64, updated_at: new Date().toISOString() },
      { onConflict: 'diagram_id' }
    )
}
