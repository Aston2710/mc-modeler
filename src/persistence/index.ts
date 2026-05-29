import { LocalRepository } from './LocalRepository'
import { SupabaseRepository } from './SupabaseRepository'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { IDiagramRepository } from './IDiagramRepository'

/**
 * Selección de backend:
 *  - Supabase configurado (VITE_SUPABASE_*) → persistencia en la nube.
 *  - En otro caso → IndexedDB local (comportamiento original, modo offline/anónimo).
 *
 * Se exporta una única instancia para no tocar los call sites (stores).
 */
export const diagramRepository: IDiagramRepository = isSupabaseConfigured
  ? new SupabaseRepository()
  : new LocalRepository()

export { LocalRepository, SupabaseRepository }
