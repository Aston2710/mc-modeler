import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  /** true una vez que se resolvió el estado inicial de sesión (o si no hay Supabase) */
  initialized: boolean
  init: () => void
  /**
   * `redirectTo` opcional: a dónde vuelve el enlace. Por defecto, la raíz. Solo
   * lo usa la pantalla de consentimiento OAuth (MASTER-PLAN-038), que necesita
   * volver a `/oauth/consent?authorization_id=…` tras iniciar sesión.
   */
  signInWithEmail: (email: string, redirectTo?: string) => Promise<{ error: string | null }>
  signInWithGoogle: (redirectTo?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

let authSubscription: { unsubscribe: () => void } | null = null

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  user: null,
  // Sin Supabase configurado, la app arranca lista en modo local.
  initialized: !isSupabaseConfigured,

  init: () => {
    if (!supabase || authSubscription) return

    void supabase.auth.getSession().then(({ data }) => {
      set({
        session: data.session,
        user: data.session?.user ?? null,
        initialized: true,
      })
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, initialized: true })
    })
    authSubscription = data.subscription
  },

  signInWithEmail: async (email, redirectTo) => {
    if (!supabase) return { error: 'Supabase no configurado' }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo ?? window.location.origin },
    })
    return { error: error?.message ?? null }
  },

  signInWithGoogle: async (redirectTo) => {
    if (!supabase) return { error: 'Supabase no configurado' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo ?? window.location.origin },
    })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },
}))
