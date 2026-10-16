import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Utilidades para probar el conector contra el LABORATORIO (`npm run lab`):
 * tokens OAuth reales, emitidos por el servidor OAuth de Supabase local con el
 * mismo flujo que hace Claude (registro dinámico + PKCE + consentimiento).
 *
 * Usuarios: los de `supabase/seed.sql` (dev@local.test y dev2@local.test,
 * contraseña "lab"). Nada de esto existe ni funciona contra producción.
 */

export function leerEnvLab(): Record<string, string> {
  const ruta = new URL('../.env.lab', import.meta.url)
  if (!existsSync(ruta)) return {}
  return Object.fromEntries(
    readFileSync(ruta, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
  )
}

export const ENV = leerEnvLab()
export const AUTH = `${ENV.SUPABASE_URL}/auth/v1`

export async function laboratorioArriba(): Promise<boolean> {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) return false
  if (!ENV.SUPABASE_URL.includes('127.0.0.1') && !ENV.SUPABASE_URL.includes('localhost')) return false // nunca otra cosa
  try {
    const r = await fetch(`${AUTH}/.well-known/oauth-authorization-server`)
    return r.ok
  } catch {
    return false
  }
}

export function clienteConSesion(): SupabaseClient {
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Sesión NORMAL de la app (sin client_id). Para comprobar que el MCP la rechaza. */
export async function sesionApp(email: string): Promise<{ sb: SupabaseClient; token: string; userId: string }> {
  const sb = clienteConSesion()
  const { data, error } = await sb.auth.signInWithPassword({ email, password: 'lab' })
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message}`)
  return { sb, token: data.session.access_token, userId: data.user.id }
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Token del CONECTOR: el flujo OAuth completo, como lo hace un cliente MCP. */
export async function tokenConector(email: string, resource = 'http://localhost:7655/mcp'): Promise<string> {
  const redirect = 'http://localhost:7799/callback'
  const reg = await fetch(`${AUTH}/oauth/clients/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Prueba MCP',
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  }).then((r) => r.json()) as { client_id: string }

  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const q = new URLSearchParams({
    response_type: 'code', client_id: reg.client_id, redirect_uri: redirect,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'prueba', scope: 'email', resource,
  })
  const auth = await fetch(`${AUTH}/oauth/authorize?${q}`, { redirect: 'manual' })
  const consent = new URL(auth.headers.get('location') ?? '')
  const authorizationId = consent.searchParams.get('authorization_id')
  if (!authorizationId) throw new Error(`sin authorization_id: ${auth.status}`)

  // Lo mismo que hace src/components/auth/OAuthConsent.tsx al pulsar "Permitir".
  const { sb } = await sesionApp(email)
  const det = await sb.auth.oauth.getAuthorizationDetails(authorizationId)
  if (det.error) throw new Error(`detalles: ${det.error.message}`)
  const ok = await sb.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (ok.error || !ok.data) throw new Error(`aprobar: ${ok.error?.message}`)
  const code = new URL(ok.data.redirect_url).searchParams.get('code')
  if (!code) throw new Error('sin código')

  const tok = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier, resource,
    }),
  }).then((r) => r.json()) as { access_token?: string; error?: string }
  if (!tok.access_token) throw new Error(`token: ${JSON.stringify(tok)}`)
  return tok.access_token
}

export function claims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

/** Consulta de solo lectura a la base del laboratorio (para comprobar la auditoría). */
export function sqlLab(consulta: string): string {
  return execFileSync('docker', ['exec', 'supabase_db_mc-modeler', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', consulta], { encoding: 'utf8' }).trim()
}

/** Llama a una tool como lo haría un cliente MCP por HTTP. */
export async function llamarTool(
  app: (req: Request) => Promise<Response>,
  token: string | null,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ status: number; isError?: boolean; datos?: unknown; texto?: string; cabeceras: Headers }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
  }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await app(new Request('http://localhost:7655/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }))
  const cuerpo = await res.text()
  if (res.status !== 200) return { status: res.status, texto: cuerpo, cabeceras: res.headers }
  const json = res.headers.get('content-type')?.includes('text/event-stream')
    ? JSON.parse(cuerpo.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).pop() ?? '{}')
    : JSON.parse(cuerpo)
  if (json.error) return { status: 200, isError: true, texto: JSON.stringify(json.error), cabeceras: res.headers }
  const texto: string = json.result?.content?.[0]?.text ?? ''
  let datos: unknown
  try { datos = JSON.parse(texto) } catch { datos = undefined }
  return { status: 200, isError: !!json.result?.isError, datos, texto, cabeceras: res.headers }
}
