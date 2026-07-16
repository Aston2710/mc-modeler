import { LocalRepository } from './LocalRepository'
import { SupabaseRepository } from './SupabaseRepository'
import { LocalImageRepository } from './LocalImageRepository'
import { SupabaseImageRepository } from './SupabaseImageRepository'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { IDiagramRepository } from './IDiagramRepository'
import type { IImageRepository } from './IImageRepository'

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

export const imageRepository: IImageRepository = isSupabaseConfigured
  ? new SupabaseImageRepository()
  : new LocalImageRepository()

export { LocalRepository, SupabaseRepository, LocalImageRepository, SupabaseImageRepository }
