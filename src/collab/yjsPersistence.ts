import { supabase } from '@/lib/supabase'

/** Carga el snapshot del Y.Doc (base64) para un diagrama, o null si no existe. */
export async function loadYjsState(diagramId: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('yjs_documents')
    .select('state')
    .eq('diagram_id', diagramId)
    .maybeSingle()
  if (error || !data) return null
  return (data as { state: string | null }).state ?? null
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
