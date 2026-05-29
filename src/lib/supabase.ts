import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Cuando las variables de entorno no están presentes, la app sigue funcionando
 * en "modo local" (IndexedDB, sin auth) tal como antes. En cuanto se configuran
 * VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY, se activa el modo nube + auth.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
