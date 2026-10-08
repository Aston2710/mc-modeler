import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/server'
import type { Config } from './config'

/**
 * Cliente de Supabase que actúa COMO EL USUARIO: la clave anónima más el JWT
 * que el usuario autorizó para el conector. RLS y la guardia del conector
 * (migración 20261008120000) deciden qué puede hacer. Nunca `service_role`.
 */
export function clienteDelUsuario(config: Config, token: string): SupabaseClient {
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  // Realtime no lee la cabecera global: sin esto se conectaría como anónimo.
  void sb.realtime.setAuth(token)
  return sb
}

/**
 * Verificación del token para `withMcpAuth`.
 *
 * - `getClaims` valida la firma (con el JWKS público si la clave es asimétrica,
 *   como en producción, ES256) y la caducidad.
 * - Exige la claim `client_id`: solo la llevan los tokens emitidos por el
 *   servidor OAuth. Una sesión normal de la app se rechaza aunque sea válida,
 *   así la guardia de la base (que reconoce el conector por esa claim) nunca
 *   queda sin aplicar.
 * - Cualquier fallo devuelve `undefined` → 401, sin explicar por qué.
 */
export async function verificarToken(config: Config, token: string | undefined): Promise<AuthInfo | undefined> {
  if (!token || token.length > 8192) return undefined
  try {
    const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await sb.auth.getClaims(token)
    const c = data?.claims as Record<string, unknown> | undefined
    if (error || !c) return undefined
    const exp = typeof c.exp === 'number' ? c.exp : 0
    if (!c.sub || exp * 1000 <= Date.now()) return undefined
    if (typeof c.client_id !== 'string' || !c.client_id) return undefined
    if (c.role !== 'authenticated') return undefined
    return {
      token,
      clientId: c.client_id,
      scopes: typeof c.scope === 'string' ? c.scope.split(' ').filter(Boolean) : [],
      expiresAt: exp,
      extra: { userId: String(c.sub), email: typeof c.email === 'string' ? c.email : undefined },
    }
  } catch {
    return undefined
  }
}

export function usuarioDe(auth: AuthInfo | undefined): { userId: string; email?: string; token: string } {
  const userId = auth?.extra?.userId
  if (!auth || typeof userId !== 'string') throw new Error('sin autenticación')
  return { userId, email: auth.extra?.email as string | undefined, token: auth.token }
}
